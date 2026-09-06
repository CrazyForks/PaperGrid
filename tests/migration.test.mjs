import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

test('upgrade preserves 1.0.30 records and backfills private media references', () => {
  const db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys=ON')
  const directory = resolve('prisma/migrations')
  const migrations = readdirSync(directory).filter(name => /^\d/.test(name)).sort()
  for (const name of migrations.slice(0, 9)) db.exec(readFileSync(resolve(directory, name, 'migration.sql'), 'utf8'))
  db.exec(`INSERT INTO User(id,email,role,updatedAt) VALUES('admin','admin@test.invalid','ADMIN',CURRENT_TIMESTAMP);
    INSERT INTO MediaFile(id,originalName,storagePath,mimeType,ext,size) VALUES('image-a','a.png','a.png','image/png','png',100);
    INSERT INTO Post(id,title,slug,content,status,authorId,isProtected,passwordHash,updatedAt)
    VALUES('post-a','Secret','secret','![image](/api/files/image-a)','PUBLISHED','admin',1,'existing-hash',CURRENT_TIMESTAMP);`)
  const structuredAt = migrations.indexOf('20260905020000_structured_media_references')
  assert.ok(structuredAt > 9)
  for (const name of migrations.slice(9, structuredAt)) db.exec(readFileSync(resolve(directory, name, 'migration.sql'), 'utf8'))
  assert.equal(db.prepare('SELECT count(*) n FROM PostMedia').get().n, 1)
  assert.equal(db.prepare('SELECT passwordHash FROM Post').get().passwordHash, 'existing-hash')
  assert.equal(db.prepare('SELECT private FROM MediaFile').get().private, 1)
  db.exec(`UPDATE Post SET content='no image' WHERE id='post-a'`)
  assert.equal(db.prepare('SELECT count(*) n FROM PostMedia').get().n, 0)
  assert.equal(db.prepare('SELECT private FROM MediaFile').get().private, 1)
  db.exec(`UPDATE Post SET coverImage='/api/files/image-a' WHERE id='post-a'`)
  assert.equal(db.prepare('SELECT count(*) n FROM PostMedia').get().n, 1)
  db.exec(`DELETE FROM MediaFile WHERE id='image-a'`)
  assert.equal(db.prepare('SELECT count(*) n FROM PostMedia').get().n, 0)
  for (const name of migrations.slice(structuredAt)) db.exec(readFileSync(resolve(directory, name, 'migration.sql'), 'utf8'))
  assert.equal(db.prepare("SELECT sessionVersion FROM User WHERE id='admin'").get().sessionVersion, 0)
  assert.equal(db.prepare('SELECT passwordHash FROM Post').get().passwordHash, 'existing-hash')
  assert.equal(db.prepare("SELECT count(*) n FROM sqlite_master WHERE type='trigger' AND name IN ('post_media_insert','post_media_update','media_post_insert')").get().n, 0)
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), [])
  db.close()
})
