import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import fsPromises from 'node:fs/promises'
import { syncBuiltinESMExports } from 'node:module'
import { rewriteMediaReferences } from '../scripts/media-references.mjs'

test('local media URL normalization handles browser-equivalent paths without changing external images', () => {
  const origin = process.env.NEXTAUTH_URL || 'http://localhost:3000'
  for (const url of [
    '/api/files/./image-a', '/api/files/%2e/image-a', '/api/./files/image-a',
    '/other/../api/files/image-a', '/api/files/%69mage-a', '/%61pi/files/image-a',
    '&#47;api&#47;files&#47;image-a', '&#47api&#47files&#47image-a', '/api&#47;files/image-a',
    `${origin}/api/files/./image-a`, '/api/files\\image-a',
  ]) {
    const source = `<img src="${url}">\n![alt](${url})`
    const parsed = rewriteMediaReferences(source)
    assert.deepEqual(parsed.ids, ['image-a'], url)
    assert.equal(parsed.text, '<img src="/api/files/image-a">\n![alt](/api/files/image-a)', url)
  }
  assert.deepEqual(rewriteMediaReferences('/api/files/a?download=1#preview'), {
    ids: ['a'], text: '/api/files/a?download=1#preview',
  })
  const external = '![external](https://other.invalid/api/files/./image-a)'
  assert.deepEqual(rewriteMediaReferences(external), { text: external, ids: [] })
  assert.deepEqual(rewriteMediaReferences('/api/files/image-ab').ids, ['image-ab'])
  assert.deepEqual(rewriteMediaReferences('/api/files/\timage-a', undefined, 'url'), { ids: ['image-a'], text: '/api/files/image-a' })
  assert.deepEqual(rewriteMediaReferences(`<img alt='a > b' src="/api/files/\nimage-a">`), {
    ids: ['image-a'], text: `<img alt='a > b' src="/api/files/image-a">`,
  })
  const article = '# Title & notes\n<a href="/api/files/image-a">download</a>'
  assert.deepEqual(rewriteMediaReferences(article), { ids: ['image-a'], text: article })
})

test('Markdown beginning with a media URL preserves headings and body, while standalone URLs normalize whitespace', () => {
  const source = '/api/files/image-a\n\n# 图片说明\n测试正文\n\n第二段 **加粗**'
  assert.deepEqual(rewriteMediaReferences(source), { text: source, ids: ['image-a'] })
  assert.deepEqual(rewriteMediaReferences(source, new Map([['image-a', 'copied-image']])), {
    text: source.replace('image-a', 'copied-image'), ids: ['copied-image'],
  })
  assert.deepEqual(rewriteMediaReferences('/api/fi\tles/\nimage-a?download=1#preview', undefined, 'url'), {
    text: '/api/files/image-a?download=1#preview', ids: ['image-a'],
  })
  const external = 'https://other.invalid/api/fi\tles/image-a'
  assert.deepEqual(rewriteMediaReferences(external, undefined, 'url'), { text: external, ids: [] })
})

test('HTML media attributes follow browser parsing while preserving the surrounding Markdown', () => {
  const source = `# 标题 &amp; 原文\n\n<img alt='src="'  SRC = "/api/fi\tles/foo" data-note="keep &amp; spaces">\n\n**尾注**  \n`
  assert.deepEqual(rewriteMediaReferences(source), {
    ids: ['foo'], text: source.replace('/api/fi\tles/foo', '/api/files/foo'),
  })
  const duplicate = `<img src='/api/files/./first' SRC="/api/files/second">`
  assert.deepEqual(rewriteMediaReferences(duplicate, new Map([['first', 'private-first'], ['second', 'private-second']])), {
    ids: ['private-first'], text: `<img src='/api/files/private-first' SRC="/api/files/second">`,
  })
  for (const first of ['', 'https://other.invalid/api/files/first']) {
    const html = `<img src="${first}" src="/api/files/second">`
    assert.deepEqual(rewriteMediaReferences(html), { ids: [], text: html })
  }
  assert.deepEqual(rewriteMediaReferences('<img src src="/api/files/second">'), {
    ids: [], text: '<img src src="/api/files/second">',
  })
  const entities = `<img src='&#47;api&#47;fi&#9;les&#47;./foo?x=1&amp;y=2' alt="&amp; unchanged">`
  assert.deepEqual(rewriteMediaReferences(entities), {
    ids: ['foo'], text: `<img src='/api/files/foo?x=1&amp;y=2' alt="&amp; unchanged">`,
  })
  const doubleEncoded = '<img src="&amp;#47;api&amp;#47;files/foo">'
  assert.deepEqual(rewriteMediaReferences(doubleEncoded), { ids: [], text: doubleEncoded })
  assert.deepEqual(rewriteMediaReferences('<video poster=/api/files/%66oo><a href = "/other/../api/files/foo">link</a></video>'), {
    ids: ['foo'], text: '<video poster=/api/files/foo><a href = "/api/files/foo">link</a></video>',
  })
  const origin = new URL(process.env.NEXTAUTH_URL || 'http://localhost:3000').origin
  assert.deepEqual(rewriteMediaReferences(`<${origin}/api/files/./foo>`, new Map([['foo', 'private-foo']])), {
    ids: ['private-foo'], text: `<${origin}/api/files/private-foo>`,
  })
  const external = `<img alt='src="' src="https://other.invalid/api/fi\tles/foo?x=1&amp;y=2">`
  assert.deepEqual(rewriteMediaReferences(external), { ids: [], text: external })
})

test('post writes atomically isolate media, maintain references and compensate failed files', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'papergrid-media-write-'))
  const dbPath = path.join(directory, 'test.sqlite')
  const uploadRoot = path.join(directory, 'uploads')
  const sqlite = new DatabaseSync(dbPath)
  for (const migration of (await readdir('prisma/migrations')).filter(name => /^\d/.test(name)).sort()) {
    sqlite.exec(await readFile(`prisma/migrations/${migration}/migration.sql`, 'utf8'))
  }
  assert.equal(sqlite.prepare("SELECT count(*) n FROM sqlite_master WHERE type='trigger' AND name IN ('post_media_insert','post_media_update','media_post_insert')").get()?.n, 0)
  sqlite.close()
  const previousUrl = process.env.DATABASE_URL
  const previousRoot = process.env.MEDIA_ROOT
  process.env.DATABASE_URL = `file:${dbPath}`
  process.env.MEDIA_ROOT = uploadRoot
  const { prisma, postWriter, getPluginPostWriter } = await import('../src/lib/prisma.ts')
  const diskFiles = async () => (await readdir(uploadRoot, { recursive: true, withFileTypes: true })).filter(entry => entry.isFile()).map(entry => `${entry.parentPath}/${entry.name}`).sort()
  try {
    const author = await prisma.user.create({ data: { email: 'media@test.invalid', role: 'ADMIN' } })
    await mkdir(uploadRoot, { recursive: true })
    const image = async (id, exists = true) => {
      const file = await prisma.mediaFile.create({ data: { id, originalName: `${id}.png`, storagePath: `${id}.png`, ext: 'png', mimeType: 'image/png', size: 5 } })
      if (exists) await writeFile(path.join(uploadRoot, file.storagePath), 'bytes')
      return file
    }
    const published = async (slug, content) => postWriter.post.create({ data: { slug, title: slug, content, status: 'PUBLISHED', authorId: author.id } })
    const whileCopyPaused = async (test, write, check) => {
      let started, resume
      const copying = new Promise(resolve => { started = resolve })
      const gate = new Promise(resolve => { resume = resolve })
      const original = fsPromises.copyFile
      const mock = test.mock.method(fsPromises, 'copyFile', async (...args) => {
        started()
        await gate
        return original(...args)
      })
      syncBuiltinESMExports()
      const pending = write()
      try {
        await Promise.race([copying, pending.then(() => { throw new Error('Expected a media copy') })])
        let timer
        try {
          await Promise.race([
            check(),
            new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Database blocked by file copy')), 1500) }),
          ])
        } finally { clearTimeout(timer) }
      } finally {
        resume()
        await pending.finally(() => {
          mock.mock.restore()
          syncBuiltinESMExports()
        })
      }
    }
    await t.test('slow media copies release the connection and recheck concurrently added public references', async test => {
      const media = await image('concurrent-image')
      const post = await published('concurrent-original', `![](/api/files/${media.id})`)
      await whileCopyPaused(test,
        () => postWriter.post.update({ where: { id: post.id }, data: { status: 'DRAFT' } }),
        async () => {
          assert.ok(await prisma.post.count({ where: { status: 'PUBLISHED' } }))
          await published('concurrent-public-reuse', post.content)
        },
      )
      assert.equal((await prisma.mediaFile.findUniqueOrThrow({ where: { id: media.id } })).private, false)
      const draft = await prisma.post.findUniqueOrThrow({ where: { id: post.id } })
      assert.equal(draft.status, 'DRAFT')
      assert.notEqual(draft.content, post.content)
      const ref = await prisma.postMedia.findFirstOrThrow({ where: { postId: post.id } })
      assert.equal((await prisma.mediaFile.findUniqueOrThrow({ where: { id: ref.mediaId } })).private, true)
    })
    await t.test('concurrent content edits preserve the latest body and discard unused staged files', async test => {
      await image('discard-image')
      const post = await published('discard-post', '![](/api/files/discard-image)')
      const beforeFiles = await diskFiles()
      const beforeCount = await prisma.mediaFile.count()
      await whileCopyPaused(test,
        () => postWriter.post.update({ where: { id: post.id }, data: { status: 'DRAFT' } }),
        () => postWriter.post.update({ where: { id: post.id }, data: { content: 'Updated while copying' } }),
      )
      const saved = await prisma.post.findUniqueOrThrow({ where: { id: post.id } })
      assert.equal(saved.content, 'Updated while copying')
      assert.equal(saved.status, 'DRAFT')
      assert.equal(await prisma.postMedia.count({ where: { postId: post.id } }), 0)
      assert.equal(await prisma.mediaFile.count(), beforeCount)
      assert.deepEqual(await diskFiles(), beforeFiles)
    })
    await t.test('saving Markdown preserves its layout independently from cover URL normalization', async () => {
      await image('body-first-image')
      const content = '/api/files/body-first-image\n\n# 图片说明\n测试正文'
      const post = await postWriter.post.create({ data: {
        slug: 'body-first', title: 'body-first', content, status: 'PUBLISHED', authorId: author.id,
        coverImage: '/api/fi\tles/\nbody-first-image',
      } })
      assert.equal(post.content, content)
      assert.equal(post.coverImage, '/api/files/body-first-image')
      assert.equal(await prisma.postMedia.count({ where: { postId: post.id } }), 1)
      const updated = await postWriter.post.update({ where: { id: post.id }, data: { status: 'DRAFT' } })
      const reference = await prisma.postMedia.findFirstOrThrow({ where: { postId: post.id } })
      assert.equal(updated.content, content.replace('body-first-image', reference.mediaId))
      assert.equal(updated.coverImage, `/api/files/${reference.mediaId}`)
    })
    for (const sourceKind of ['protected', 'draft']) {
      await t.test(`public reuse of a ${sourceKind} image creates a public copy and preserves its private source`, async () => {
        await image(`source-${sourceKind}`)
        const source = await postWriter.post.create({ data: {
          slug: `source-${sourceKind}`, title: 'source', authorId: author.id,
          content: `![x](/api/files/source-${sourceKind})`,
          status: sourceKind === 'draft' ? 'DRAFT' : 'PUBLISHED', isProtected: sourceKind === 'protected',
        } })
        const privateRef = await prisma.postMedia.findFirstOrThrow({ where: { postId: source.id } })
        const publicPost = await postWriter.post.create({ data: {
          slug: `reuse-${sourceKind}`, title: 'reuse', authorId: author.id, status: 'PUBLISHED',
          content: source.content, coverImage: `/api/files/${privateRef.mediaId}`,
        } })
        const publicRef = await prisma.postMedia.findFirstOrThrow({ where: { postId: publicPost.id } })
        assert.notEqual(publicRef.mediaId, privateRef.mediaId)
        const privateFile = await prisma.mediaFile.findUniqueOrThrow({ where: { id: privateRef.mediaId } })
        const publicFile = await prisma.mediaFile.findUniqueOrThrow({ where: { id: publicRef.mediaId } })
        assert.equal(privateFile.private, true)
        assert.equal(publicFile.private, false)
        assert.equal(publicPost.content, `![x](/api/files/${publicRef.mediaId})`)
        assert.equal(publicPost.coverImage, `/api/files/${publicRef.mediaId}`)
        assert.equal((await prisma.post.findUniqueOrThrow({ where: { id: source.id } })).content, source.content)
        assert.deepEqual(await readFile(path.join(uploadRoot, publicFile.storagePath)), await readFile(path.join(uploadRoot, privateFile.storagePath)))
        const count = await prisma.mediaFile.count()
        await postWriter.post.update({ where: { id: publicPost.id }, data: { content: publicPost.content + '\nmore' } })
        assert.equal(await prisma.mediaFile.count(), count)

        const beforeFiles = await diskFiles()
        const beforeRefs = await prisma.postMedia.findMany({ where: { postId: publicPost.id } })
        await assert.rejects(postWriter.post.update({ where: { id: publicPost.id }, data: {
          content: source.content, coverImage: `/api/files/${privateRef.mediaId}`, categoryId: 'missing-category',
        } }), { code: 'P2003' })
        assert.equal(await prisma.mediaFile.count(), count)
        assert.deepEqual(await diskFiles(), beforeFiles)
        assert.deepEqual(await prisma.postMedia.findMany({ where: { postId: publicPost.id } }), beforeRefs)
        assert.equal((await prisma.post.findUniqueOrThrow({ where: { id: publicPost.id } })).content, publicPost.content + '\nmore')
        assert.equal((await prisma.mediaFile.findUniqueOrThrow({ where: { id: privateRef.mediaId } })).private, true)
      })
    }
    await t.test('plugin writes require read access to private sources and reject unattached private uploads', async () => {
      const media = await image('plugin-private')
      await prisma.mediaFile.update({ where: { id: media.id }, data: { private: true } })
      const source = await postWriter.post.create({ data: {
        slug: 'plugin-private-source', title: 'private', authorId: author.id,
        content: `![](/api/files/${media.id})`, status: 'PUBLISHED', isProtected: true,
      } })
      const limited = getPluginPostWriter(false)
      const reader = getPluginPostWriter(true)
      const beforeFiles = await diskFiles()
      const beforeCount = await prisma.mediaFile.count()
      for (const status of ['PUBLISHED', 'DRAFT']) {
        for (const field of ['content', 'coverImage']) {
          await assert.rejects(limited.post.create({ data: {
            slug: `blocked-${status}-${field}`, title: 'blocked', authorId: author.id,
            content: 'body', status, [field]: '/api/files/%70lugin-private',
          } }), { status: 403 })
        }
      }
      const target = await published('plugin-target', 'unchanged')
      await assert.rejects(limited.post.update({ where: { id: target.id }, data: { coverImage: '/api/files/plugin-private' } }), { status: 403 })
      assert.equal((await prisma.post.findUniqueOrThrow({ where: { id: target.id } })).coverImage, null)
      await assert.rejects(limited.post.update({ where: { id: source.id }, data: { isProtected: false } }), { status: 403 })
      assert.equal(await prisma.mediaFile.count(), beforeCount)
      assert.deepEqual(await diskFiles(), beforeFiles)
      const copy = await reader.post.create({ data: {
        slug: 'plugin-readable-copy', title: 'copy', authorId: author.id, content: source.content, status: 'PUBLISHED',
      } })
      assert.notEqual(copy.content, source.content)
      assert.equal((await prisma.mediaFile.findUniqueOrThrow({ where: { id: media.id } })).private, true)
      // Uploads with no article reference are outside POST_READ's scope.
      const orphan = await image('plugin-orphan')
      await prisma.mediaFile.update({ where: { id: orphan.id }, data: { private: true } })
      await assert.rejects(reader.post.create({ data: {
        slug: 'orphan-copy', title: 'orphan', authorId: author.id, status: 'PUBLISHED', content: `![](/api/files/${orphan.id})`,
      } }), { status: 403 })
      const publicMedia = await image('plugin-public')
      const publicCopy = await limited.post.create({ data: {
        slug: 'plugin-public-copy', title: 'public', authorId: author.id, status: 'PUBLISHED', content: `![](/api/files/${publicMedia.id})`,
      } })
      assert.ok(publicCopy.content.includes(publicMedia.id))
    })
    await t.test('plugin media access is rechecked if the source becomes private while copying', async test => {
      const media = await image('plugin-race')
      const limited = getPluginPostWriter(false)
      await assert.rejects(whileCopyPaused(test,
        () => limited.post.create({ data: { slug: 'plugin-race-draft', title: 'race', authorId: author.id, content: `![](/api/files/${media.id})` } }),
        () => prisma.mediaFile.update({ where: { id: media.id }, data: { private: true } }),
      ), { status: 403 })
      assert.equal(await prisma.post.count({ where: { slug: 'plugin-race-draft' } }), 0)
      assert.equal(await prisma.mediaFile.count({ where: { originalName: media.originalName } }), 1)
    })
    await t.test('failed FK update restores post, private flags, references and copied files', async () => {
      const media = await image('failure-image')
      const post = await published('failure-post', `![x](/api/files/${media.id})`)
      const beforeFiles = await diskFiles()
      const beforeCount = await prisma.mediaFile.count()
      await assert.rejects(postWriter.post.update({ where: { id: post.id }, data: { status: 'DRAFT', categoryId: 'deleted-category' } }), { code: 'P2003' })
      assert.equal((await prisma.post.findUniqueOrThrow({ where: { id: post.id } })).status, 'PUBLISHED')
      assert.equal((await prisma.mediaFile.findUniqueOrThrow({ where: { id: media.id } })).private, false)
      assert.deepEqual(await prisma.postMedia.findMany({ where: { postId: post.id } }), [{ postId: post.id, mediaId: media.id }])
      assert.equal(await prisma.mediaFile.count(), beforeCount)
      assert.deepEqual(await diskFiles(), beforeFiles)
    })
    await t.test('a later missing file rolls back earlier successful copies', async () => {
      await image('a-present')
      await image('z-missing', false)
      const beforeFiles = await diskFiles()
      const beforeCount = await prisma.mediaFile.count()
      await assert.rejects(postWriter.post.create({ data: { slug: 'copy-failure', title: 'failed', content: '![](/api/files/a-present) ![](/api/files/z-missing)', authorId: author.id } }), { code: 'ENOENT' })
      assert.equal(await prisma.post.count({ where: { slug: 'copy-failure' } }), 0)
      assert.equal(await prisma.mediaFile.count(), beforeCount)
      assert.deepEqual(await diskFiles(), beforeFiles)
      assert.equal((await prisma.mediaFile.findUniqueOrThrow({ where: { id: 'a-present' } })).private, false)
    })
    await t.test('duplicate slug after copy is fully compensated', async () => {
      const beforeFiles = await diskFiles()
      const beforeCount = await prisma.mediaFile.count()
      await assert.rejects(postWriter.post.create({ data: { slug: 'failure-post', title: 'failed', content: '![](/api/files/a-present)', authorId: author.id } }), { code: 'P2002' })
      assert.equal(await prisma.mediaFile.count(), beforeCount)
      assert.deepEqual(await diskFiles(), beforeFiles)
    })
    await t.test('shared public URL stays stable while draft gets its own normalized URL', async () => {
      const media = await image('shared-image')
      const original = await published('public-post', `![x](/api/files/${media.id})`)
      const draft = await postWriter.post.create({ data: { slug: 'draft-post', title: 'draft', content: `![x](/api/files/./${media.id})`, coverImage: `/api/files/%73hared-image`, authorId: author.id } })
      const refs = await prisma.postMedia.findMany({ where: { postId: draft.id } })
      assert.equal(refs.length, 1)
      assert.notEqual(refs[0].mediaId, media.id)
      assert.equal(draft.content, `![x](/api/files/${refs[0].mediaId})`)
      assert.equal(draft.coverImage, `/api/files/${refs[0].mediaId}`)
      assert.equal((await prisma.post.findUniqueOrThrow({ where: { id: original.id } })).content, original.content)
      assert.equal((await prisma.mediaFile.findUniqueOrThrow({ where: { id: media.id } })).private, false)
      assert.equal((await prisma.mediaFile.findUniqueOrThrow({ where: { id: refs[0].mediaId } })).private, true)
      const beforeCount = await prisma.mediaFile.count()
      await postWriter.post.update({ where: { id: draft.id }, data: { content: { set: draft.content + '\nmore' } } })
      assert.equal(await prisma.mediaFile.count(), beforeCount)
      await postWriter.post.update({ where: { id: draft.id }, data: { status: 'PUBLISHED' } })
      assert.equal((await prisma.mediaFile.findUniqueOrThrow({ where: { id: refs[0].mediaId } })).private, false)
    })
    await t.test('protecting an exclusively public image retires its old URL and supports select', async () => {
      const media = await image('exclusive-image')
      const post = await published('exclusive-post', `![x](/api/files/${media.id})`)
      const updated = await postWriter.post.update({ where: { id: post.id }, data: { isProtected: true }, select: { content: true } })
      assert.deepEqual(Object.keys(updated), ['content'])
      assert.notEqual(updated.content, post.content)
      assert.equal((await prisma.mediaFile.findUniqueOrThrow({ where: { id: media.id } })).private, true)
      assert.equal(await prisma.postMedia.count({ where: { postId: post.id } }), 1)
      await postWriter.post.update({ where: { id: post.id }, data: { content: 'removed', coverImage: null } })
      assert.equal(await prisma.postMedia.count({ where: { postId: post.id } }), 0)
    })
    await t.test('seed upserts maintain references and return the final relations', async () => {
      await image('upsert-image')
      const where = { slug: 'upsert-post' }
      const create = { slug: where.slug, title: 'upsert', content: '![](/api/files/./upsert-image)', status: 'PUBLISHED', authorId: author.id }
      const created = await postWriter.post.upsert({ where, create, update: {}, select: { mediaReferences: true } })
      assert.equal(created.mediaReferences.length, 1)
      assert.deepEqual(Object.keys(created), ['mediaReferences'])
      const updated = await postWriter.post.upsert({ where, create, update: { status: 'DRAFT' }, omit: { id: true }, include: { mediaReferences: true } })
      assert.equal('id' in updated, false)
      assert.equal(updated.mediaReferences.length, 1)
      assert.notEqual(updated.mediaReferences[0].mediaId, 'upsert-image')
      assert.equal((await prisma.mediaFile.findUniqueOrThrow({ where: { id: updated.mediaReferences[0].mediaId } })).private, true)
    })
    await t.test('large text with 5000 media files writes without a media-table content scan', async () => {
      for (let start = 0; start < 5000; start += 200) {
        await prisma.mediaFile.createMany({ data: Array.from({ length: 200 }, (_, i) => ({ id: `perf-${start + i}`, originalName: 'perf.png', storagePath: `perf-${start + i}.png`, mimeType: 'image/png', ext: 'png', size: 1 })) })
      }
      const start = performance.now()
      const post = await published('large-text', 'x'.repeat(900_000))
      t.diagnostic(`5000 media / 900 KB post write: ${Math.round(performance.now() - start)} ms`)
      assert.equal(await prisma.postMedia.count({ where: { postId: post.id } }), 0)
    })
  } finally {
    await prisma.$disconnect()
    if (previousUrl === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previousUrl
    if (previousRoot === undefined) delete process.env.MEDIA_ROOT; else process.env.MEDIA_ROOT = previousRoot
    await rm(directory, { recursive: true, force: true })
  }
})
