import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { PrismaClient } from '@prisma/client'
import { getCommentPage } from '../src/lib/comment-pagination.ts'

test('comment pagination locates targets, bounds parent context and isolates unpublished comments', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'papergrid-comment-pages-'))
  const databasePath = path.join(directory, 'test.sqlite')
  const sqlite = new DatabaseSync(databasePath)
  for (const migration of (await readdir('prisma/migrations')).filter(name => /^\d/.test(name)).sort()) {
    sqlite.exec(await readFile(`prisma/migrations/${migration}/migration.sql`, 'utf8'))
  }
  sqlite.close()
  const db = new PrismaClient({ datasources: { db: { url: `file:${databasePath}` } } })
  try {
    const author = await db.user.create({ data: { email: 'comment-test@papergrid.invalid', name: '作者' } })
    const post = await db.post.create({ data: { title: '评论测试', slug: 'comments', content: '', authorId: author.id, status: 'PUBLISHED' } })
    const otherPost = await db.post.create({ data: { title: '其他文章', slug: 'other', content: '', authorId: author.id } })
    // Equal timestamps exercise the stable ID tiebreaker used by both rank and pagination.
    const date = new Date('2026-01-01T00:00:00Z')
    await db.comment.createMany({ data: Array.from({ length: 65 }, (_, index) => ({
      id: `c${String(index + 1).padStart(3, '0')}`,
      postId: post.id, content: index === 0 ? '父评论'.repeat(200) : `评论 ${index + 1}`,
      authorName: '访客', authorEmail: 'secret@papergrid.invalid', status: 'APPROVED', createdAt: date,
    })) })
    await db.comment.update({ where: { id: 'c031' }, data: { parentId: 'c001' } })
    await db.comment.update({ where: { id: 'c032' }, data: { parentId: 'c031' } })
    await db.comment.create({ data: { id: 'pending', postId: post.id, content: '审核秘密', status: 'PENDING', createdAt: date } })
    await db.comment.create({ data: { id: 'other', postId: otherPost.id, content: '其他文章秘密', status: 'APPROVED', createdAt: date } })
    await db.comment.update({ where: { id: 'c033' }, data: { parentId: 'pending' } })
    await db.comment.update({ where: { id: 'c034' }, data: { parentId: 'other' } })
    const read = (page, targetId) => db.$transaction(tx => getCommentPage(tx, post.id, page, targetId))
    const first = await read(1)
    assert.equal(first.comments.length, 30)
    assert.deepEqual(first.pagination, { page: 1, total: 65, totalPages: 3 })
    const second = await read(1, 'c031')
    assert.equal(second.pagination.page, 2)
    assert.equal(second.targetFound, true)
    assert.equal(second.comments[0].id, 'c031')
    assert.equal(second.comments.length, 30)
    assert.deepEqual(second.parentContexts, [{ id: 'c001', authorName: '访客', excerpt: '父评论'.repeat(40) }])
    assert.ok(!JSON.stringify(second).includes('secret@'))
    assert.ok(!JSON.stringify(second).includes('审核秘密'))
    assert.ok(!JSON.stringify(second).includes('其他文章秘密'))
    for (const id of ['pending', 'other', 'missing']) {
      const result = await read(1, id)
      assert.equal(result.targetFound, false)
      assert.equal(result.pagination.page, 1)
      assert.ok(!result.comments.some(comment => comment.id === id))
    }
    const last = await read(1, 'c065')
    assert.equal(last.pagination.page, 3)
    assert.equal(last.comments.length, 5)
    assert.equal((await read(999)).pagination.page, 3)
    const created = await db.comment.create({ data: {
      id: 'new-reply', postId: post.id, content: '新回复', status: 'APPROVED',
      parentId: 'c001', createdAt: new Date('2026-01-02T00:00:00Z'),
    } })
    const located = await read(1, created.id)
    assert.equal(located.pagination.page, 3)
    assert.equal(located.comments.at(-1).id, created.id)
    assert.equal(located.parentContexts[0].id, 'c001')
    await db.comment.update({ where: { id: 'c001' }, data: { status: 'REJECTED' } })
    assert.equal((await read(1, created.id)).parentContexts.length, 0)
  } finally {
    await db.$disconnect()
    await rm(directory, { recursive: true, force: true })
  }
})
