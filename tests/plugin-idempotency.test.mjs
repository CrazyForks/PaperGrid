import assert from 'node:assert/strict'
import { before, after, test } from 'node:test'
import { DatabaseSync } from 'node:sqlite'
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

let directory, prisma, getPluginPostWriter, idem, user, key
before(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'papergrid-idempotency-'))
  process.env.DATABASE_URL = `file:${directory}/test.db`
  process.env.MEDIA_ROOT = path.join(directory, 'uploads')
  const db = new DatabaseSync(path.join(directory, 'test.db'))
  for (const name of (await readdir('prisma/migrations')).filter(name => /^\d/.test(name)).sort()) {
    db.exec(await readFile(path.join('prisma/migrations', name, 'migration.sql'), 'utf8'))
  }
  db.close()
  ;({ prisma, getPluginPostWriter } = await import('../src/lib/prisma.ts'))
  idem = await import('../src/lib/api-idempotency.ts')
  user = await prisma.user.create({ data: { role: 'ADMIN', email: 'idempotency@example.invalid' } })
  key = await prisma.apiKey.create({ data: { name: 'test', keyHash: 'test-hash', keyPrefix: 'test', permissions: ['POST_CREATE'], createdById: user.id } })
})
after(async () => { await prisma?.$disconnect(); if (directory) await rm(directory, { recursive: true, force: true }) })

test('request fingerprints ignore object key order, preserve arrays and never store raw payloads', () => {
  const make = body => idem.idempotencyIdentity('key', 'request-1', body, 'secret-api-key')
  assert.equal(make({ title: 'a', tags: ['1','2'] }).requestHash, make({ tags: ['1','2'], title: 'a' }).requestHash)
  assert.notEqual(make({ tags: ['1','2'] }).requestHash, make({ tags: ['2','1'] }).requestHash)
  assert.notEqual(make({ title: 'a' }).requestHash, idem.idempotencyIdentity('key', 'request-1', {title:'a'}, 'other-api-key').requestHash)
  assert.throws(() => idem.idempotencyIdentity('key', '', {}, 'secret'))
  assert.throws(() => idem.idempotencyIdentity('key', 'x'.repeat(129), {}, 'secret'))
  assert.equal(idem.idempotencyIdentity('key', null, {}, 'secret'), undefined)
})

test('concurrent writes share one durable response; conflicting payloads are rejected', async () => {
  const identity = idem.idempotencyIdentity(key.id, 'concurrent', {title:'one'}, 'secret-api-key')
  let creations = 0
  const writer = getPluginPostWriter(false, key.id, identity, () => { creations++ })
  const results = await Promise.all(Array.from({length:8},(_,i)=>writer.post.create({
    data:{title:'one',slug:`candidate-${i}`,content:'body',authorId:user.id},select:{id:true,title:true,slug:true},
  })))
  assert.equal(new Set(results.map(result=>result.id)).size,1)
  assert.equal(await prisma.post.count(),1)
  assert.equal(await prisma.apiIdempotency.count(),1)
  assert.equal(creations,1,'concurrent transaction replays must not trigger creation side effects')
  await writer.post.create({data:{title:'one',slug:'replayed-again',content:'body',authorId:user.id},select:{id:true,title:true,slug:true}})
  assert.equal(creations,1,'later replays must not trigger creation side effects')
  const record = await prisma.apiIdempotency.findFirstOrThrow()
  assert.equal('passwordHash' in record.response,false)
  const conflict = idem.idempotencyIdentity(key.id, 'concurrent', {title:'different'}, 'secret-api-key')
  await assert.rejects(idem.readIdempotentResult(prisma, conflict), error=>error.status===409)
  const other = await prisma.apiKey.create({data:{name:'other',keyHash:'other-hash',keyPrefix:'test',permissions:['POST_CREATE'],createdById:user.id}})
  assert.equal(await idem.readIdempotentResult(prisma,{...identity,apiKeyId:other.id}),null)
  const resultFile = path.join(directory, 'replayed.json')
  const env = { ...process.env, TEST_IDENTITY: JSON.stringify(identity), TEST_RESULT_FILE: resultFile }
  delete env.NODE_TEST_CONTEXT
  await promisify(execFile)(process.execPath,['--import','tsx','tests/helpers/idempotency-replay.mjs'],{env})
  assert.equal(JSON.parse(await readFile(resultFile,'utf8')).id,results[0].id,'a new process must replay the stored result')
})

test('failed writes roll back and expiry permits a new operation', async () => {
  const identity = idem.idempotencyIdentity(key.id, 'rollback', {}, 'secret')
  await assert.rejects(prisma.$transaction(tx=>idem.withIdempotency(tx,identity,async()=>{
    await tx.post.create({data:{title:'rollback',slug:'rollback',content:'body',authorId:user.id}})
    throw new Error('simulated failure')
  })),/simulated failure/)
  assert.equal(await prisma.post.count({where:{slug:'rollback'}}),0)
  assert.equal(await prisma.apiIdempotency.count({where:{keyHash:identity.keyHash}}),0)
  await prisma.apiIdempotency.updateMany({data:{expiresAt:new Date(0)}})
  const expired = idem.idempotencyIdentity(key.id, 'concurrent', {title:'new'}, 'secret-api-key')
  const created = await getPluginPostWriter(false,key.id,expired).post.create({data:{title:'new',slug:'after-expiry',content:'body',authorId:user.id},select:{id:true,slug:true}})
  assert.equal(created.slug,'after-expiry')
  assert.equal(await prisma.apiIdempotency.count(),1)
})
