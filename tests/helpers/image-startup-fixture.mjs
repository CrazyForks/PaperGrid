// Run inside the candidate image; never against a user's database.
import assert from 'node:assert/strict'
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises'

const prisma = new PrismaClient()
const mode = process.argv[2]
const marker = 'image-startup-upload-fixture'
try {
  if (mode === 'seed-legacy') {
    const passwordHash = await bcrypt.hash(process.env.TEST_UPGRADE_PASSWORD, 10)
    // Raw inserts intentionally use only columns present in v1.0.30.
    await prisma.$executeRaw`INSERT INTO User (id,email,role,password,updatedAt) VALUES ('upgrade-admin','upgrade@example.invalid','ADMIN',${passwordHash},CURRENT_TIMESTAMP)`
    await prisma.$executeRaw`INSERT INTO Post (id,title,slug,content,status,publishedAt,authorId,updatedAt) VALUES ('upgrade-post','Upgrade fixture','upgrade-fixture','Preserved article /api/files/upgrade-media','PUBLISHED',CURRENT_TIMESTAMP,'upgrade-admin',CURRENT_TIMESTAMP)`
    await prisma.$executeRaw`INSERT INTO MediaFile (id,originalName,storagePath,mimeType,ext,size,uploadedById) VALUES ('upgrade-media','fixture.txt','fixture.txt','text/plain','txt',${marker.length},'upgrade-admin')`
    await mkdir('/data/uploads', { recursive: true })
    await writeFile('/data/uploads/fixture.txt', marker)
    await writeFile('/data/expected-password-hash', passwordHash, { mode: 0o600 })
  } else {
    const user = await prisma.user.findUniqueOrThrow({ where: { email: mode === 'verify-fresh' ? 'admin@example.com' : 'upgrade@example.invalid' } })
    assert.equal(user.role, 'ADMIN')
    assert.ok(await bcrypt.compare(mode === 'verify-fresh' ? process.env.ADMIN_INIT_PASSWORD : process.env.TEST_UPGRADE_PASSWORD, user.password))
    await prisma.apiIdempotency.count() // The newest migration must have run.
    assert.ok((await prisma.$queryRaw`SELECT id FROM _prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL`).length === 0)
    assert.ok((await readFile('/data/nextauth_secret', 'utf8')).length >= 32)
    assert.equal((await stat('/data/db.sqlite')).uid, 1001)
    if (mode === 'verify-upgrade') {
      assert.equal(user.id, 'upgrade-admin')
      assert.equal(user.password, await readFile('/data/expected-password-hash', 'utf8'))
      const post = await prisma.post.findUniqueOrThrow({ where: { id: 'upgrade-post' } })
      assert.equal(post.slug, 'upgrade-fixture')
      assert.equal(post.content, 'Preserved article /api/files/upgrade-media')
      assert.equal(await readFile('/data/uploads/fixture.txt', 'utf8'), marker)
      assert.equal(await prisma.postMedia.count({ where: { postId: post.id, mediaId: 'upgrade-media' } }), 1)
    }
  }
  console.log(`PASS: ${mode}`)
} finally {
  await prisma.$disconnect()
}
