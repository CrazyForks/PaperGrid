import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { DatabaseSync } from 'node:sqlite'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

const execFileAsync = promisify(execFile)
let directory, prisma, postWriter, migration, user
before(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'papergrid-migration-test-'))
  process.env.DATABASE_URL = `file:${directory}/test.db`
  process.env.MEDIA_ROOT = path.join(directory, 'uploads')
  const db = new DatabaseSync(path.join(directory, 'test.db'))
  db.exec('PRAGMA foreign_keys=ON')
  try {
    for (const name of (await readdir('prisma/migrations')).filter(name => /^\d/.test(name)).sort()) {
      db.exec(await readFile(path.join('prisma/migrations', name, 'migration.sql'), 'utf8'))
    }
  } finally {
    db.close()
  }
  ;({ prisma, postWriter } = await import('../src/lib/prisma.ts'))
  migration = await import('../src/lib/import-export/migration.ts')
  user = await prisma.user.create({ data: { email: 'migration@example.invalid', role: 'ADMIN' } })
})
after(async () => {
  await prisma?.$disconnect()
  if (directory) await rm(directory, { recursive: true, force: true })
})

test('Markdown ZIP migration preserves protected articles without exporting password hashes', async () => {
  await postWriter.post.create({ data: {
    title: 'Protected', slug: 'protected', content: 'SECRET BODY',
    status: 'PUBLISHED', isProtected: true, passwordHash: 'not-exported-hash', authorId: user.id,
  } })
  const archive = await migration.exportMigrationMarkdownZip()
  const { extractZipEntries } = await import('../src/lib/import-export/zip.ts')
  const entries = await extractZipEntries(archive.fileBuffer)
  assert.match(entries[0].data.toString(), /isProtected: true/)
  assert.doesNotMatch(entries[0].data.toString(), /not-exported-hash/)
  await prisma.post.deleteMany()
  const result = await migration.importMigrationMarkdown({
    fileName: archive.fileName, fileBuffer: archive.fileBuffer, source: 'auto', userId: user.id,
  })
  assert.equal(result.summary.posts.created, 1)
  assert.match(result.summary.warnings.join('\n'), /保持锁定/)
  const restored = await prisma.post.findUniqueOrThrow({ where: { slug: 'protected' } })
  assert.equal(restored.isProtected, true)
  assert.equal(restored.passwordHash, null)
  assert.equal(restored.status, 'PUBLISHED')
  assert.equal(restored.content, 'SECRET BODY')
})

test('migration can tighten existing article protection but never remove an existing password', async () => {
  await prisma.post.update({ where: { slug: 'protected' }, data: { isProtected: false, passwordHash: null } })
  const input = { fileName: 'protected.md', source: 'auto', userId: user.id }
  await migration.importMigrationMarkdown({ ...input, fileBuffer: Buffer.from('---\nisProtected: true\n---\nnew content') })
  assert.equal((await prisma.post.findUniqueOrThrow({ where: { slug: 'protected' } })).isProtected, true)
  await prisma.post.update({ where: { slug: 'protected' }, data: { passwordHash: 'keep-existing-hash' } })
  await migration.importMigrationMarkdown({ ...input, fileBuffer: Buffer.from('---\nisProtected: false\n---\nnewer content') })
  const post = await prisma.post.findUniqueOrThrow({ where: { slug: 'protected' } })
  assert.equal(post.isProtected, true)
  assert.equal(post.passwordHash, 'keep-existing-hash')
})

test('distinct Chinese import slugs survive repeat import and ZIP export', async () => {
  const { createZip } = await import('../src/lib/import-export/zip.ts')
  const archive = await createZip(['入门-react', '进阶-react', 'Abc_123456789-Zxy'].map((slug, index) => ({
    name: `${index}.md`, data: Buffer.from(`---\ntitle: 文章 ${index}\nslug: ${slug}\n---\nBODY ${index}`),
  })))
  const input = { fileName: 'distinct.zip', fileBuffer: archive, source: 'auto', userId: user.id }
  const result = await migration.importMigrationMarkdown(input)
  assert.equal(result.summary.posts.created, 3)
  const ids = (await prisma.post.findMany({ where: { slug: { in: ['入门-react', '进阶-react', 'Abc_123456789-Zxy'] } }, orderBy: { slug: 'asc' } })).map(p => p.id)
  const repeated = await migration.importMigrationMarkdown(input)
  assert.equal(repeated.summary.posts.created, 0)
  assert.equal(repeated.summary.posts.updated, 3)
  for (const [index, slug] of ['入门-react', '进阶-react', 'Abc_123456789-Zxy'].entries()) {
    assert.equal((await prisma.post.findUniqueOrThrow({ where: { slug } })).content, `BODY ${index}`)
  }
  const exported = await migration.exportMigrationMarkdownZip()
  await migration.importMigrationMarkdown({ ...input, fileBuffer: exported.fileBuffer })
  const restoredIds = (await prisma.post.findMany({ where: { slug: { in: ['入门-react', '进阶-react', 'Abc_123456789-Zxy'] } }, orderBy: { slug: 'asc' } })).map(p => p.id)
  assert.deepEqual(restoredIds, ids, 'round trip must update the original articles, not duplicate them')
})

test('duplicate import identities abort before changing articles or taxonomies', async () => {
  const { createZip } = await import('../src/lib/import-export/zip.ts')
  const existing = await prisma.post.findUniqueOrThrow({ where: { slug: '入门-react' } })
  const archive = await createZip(['first.md', 'second.md'].map(name => ({
    name, data: Buffer.from('---\nslug: 入门-react\ncategories: [不应创建]\n---\nOVERWRITE'),
  })))
  await assert.rejects(migration.importMigrationMarkdown({ fileName: 'duplicate.zip', fileBuffer: archive, source: 'auto', userId: user.id }), /相同 Slug/)
  assert.equal((await prisma.post.findUniqueOrThrow({ where: { slug: '入门-react' } })).content, existing.content)
  assert.equal(await prisma.category.count({ where: { name: '不应创建' } }), 0)
})

test('Chinese and nested bundle filenames have stable identities across repeated imports', async () => {
  for (const fileName of ['中文文件.md', 'notes/✨.md', 'first/index.md', 'second/index.md']) {
    const input = { fileName, fileBuffer: Buffer.from('# First version'), source: 'auto', userId: user.id }
    const first = await migration.importMigrationMarkdown(input)
    assert.equal(first.summary.posts.created, 1)
    const next = await migration.importMigrationMarkdown({ ...input, fileBuffer: Buffer.from('# Second version') })
    assert.equal(next.summary.posts.created, 0)
    assert.equal(next.summary.posts.updated, 1)
  }
})

for (const type of ['post-delete', 'rebuild']) {
  test(`a fresh process resumes persisted ${type} tasks without submitting new work`, async () => {
    const task = {
      id: type === 'rebuild' ? 'resume-rebuild' : 'resume-delete', type,
      status: type === 'rebuild' ? 'pending' : 'running', source: 'manual',
      postId: type === 'rebuild' ? null : 'missing-post', createdAt: new Date().toISOString(),
      startedAt: type === 'rebuild' ? null : new Date().toISOString(),
      finishedAt: null, requestedBy: user.id, error: null, result: null,
    }
    const value = {
      queue: type === 'rebuild' ? [task] : [], history: [],
      current: type === 'rebuild' ? null : task, running: type !== 'rebuild',
    }
    await prisma.setting.upsert({
      where: { key: 'ai.index.task.state' },
      create: { key: 'ai.index.task.state', value, group: 'ai', editable: false },
      update: { value },
    })
    await execFileAsync(process.execPath, ['--import', 'tsx', 'tests/helpers/ai-index-recovery.mjs', type], {
      env: { ...process.env, DATABASE_URL: `file:${directory}/test.db` }, timeout: 15000,
    })
  })
}
