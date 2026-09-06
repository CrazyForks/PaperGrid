import { RequestBodyError } from './request-body'
import type { Prisma, PrismaClient } from '@prisma/client'
import { copyFile, unlink } from 'node:fs/promises'
import { constants } from 'node:fs'
import { ensureMediaDir, getStoragePath, resolveMediaPath } from './media'
import { mediaIdBatches, mediaCopy, rewriteMediaReferences, syncPostMedia } from '../../scripts/media-references.mjs'

const scalar = (value: unknown, fallback: unknown) => value === undefined ? fallback :
  value && typeof value === 'object' && 'set' in value ? value.set : value

export type PrivateMediaAccess = 'all' | 'referenced' | 'none' | { canReadPosts: boolean; apiKeyId: string }

type MediaPostData = { content?: unknown; coverImage?: unknown; isProtected?: unknown; status?: unknown }

type CopySource = { id: string; storagePath: string; ext: string }
type StagedCopy = { storagePath: string; destination: string; used: boolean }
type MediaCopies = Map<string, StagedCopy>
const copyKey = (file: CopySource) => `${file.id}:${file.storagePath}`
class MediaCopiesRequired extends Error {
  constructor(readonly files: CopySource[]) { super('Media files need staging') }
}

// Recheck references inside every transaction. Missing copies abort this read-only
// attempt; the caller stages files without holding a database connection, then retries.
export async function isolatePostMedia<T extends MediaPostData>(
  client: Prisma.TransactionClient, data: T, copies: MediaCopies, where?: Prisma.PostWhereUniqueInput,
  privateMediaAccess: PrivateMediaAccess = 'all'
) {
  const existing = where ? await client.post.findUnique({ where, select: { id: true, content: true, coverImage: true, status: true, isProtected: true } }) : null
  const protectedPost = scalar(data.isProtected, existing?.isProtected) === true
  const status = scalar(data.status, existing?.status || 'DRAFT')
  const body = rewriteMediaReferences(String(scalar(data.content, existing?.content || '')))
  const cover = rewriteMediaReferences(String(scalar(data.coverImage, existing?.coverImage || '') || ''), undefined, 'url')
  const ids = [...new Set([...body.ids, ...cover.ids])]
  const replacements = new Map<string, string>()
  const privatePost = protectedPost || status !== 'PUBLISHED'
  const filesToCopy = []
  for (const batch of mediaIdBatches(ids)) {
    const files = await client.mediaFile.findMany({
      where: { id: { in: batch } },
      include: { postReferences: { select: { postId: true, post: { select: { status: true, isProtected: true } } } } },
    })
    for (const file of files) {
      // Check the source in the same transaction, including every staging retry.
      const sourcePrivate = file.private || file.postReferences.some(ref => ref.post.isProtected || ref.post.status !== 'PUBLISHED')
      const ownUpload = typeof privateMediaAccess === 'object' && file.uploadedByApiKeyId === privateMediaAccess.apiKeyId
      const canReadPosts = privateMediaAccess === 'referenced' || (typeof privateMediaAccess === 'object' && privateMediaAccess.canReadPosts)
      if (sourcePrivate && privateMediaAccess !== 'all' && !ownUpload &&
        (!canReadPosts || !file.postReferences.length)) {
        throw new RequestBodyError('无权引用私有媒体，需要源文章读取权限', 403)
      }
      const exclusive = file.postReferences.every(ref => ref.postId === existing?.id)
      // Public reuse must not expose another post's private URL. Publishing
      // this post's own draft image can keep its URL and release it below.
      const sharedPrivate = file.postReferences.some(ref => ref.postId !== existing?.id && (ref.post.isProtected || ref.post.status !== 'PUBLISHED'))
      if (privatePost ? file.private && exclusive : !sharedPrivate) continue
      filesToCopy.push({ file, exclusive })
    }
  }
  const missing = filesToCopy.filter(({ file }) => !copies.has(copyKey(file)))
  if (missing.length) throw new MediaCopiesRequired(missing.map(({ file }) => file))
  for (const { file, exclusive } of filesToCopy) {
    const staged = copies.get(copyKey(file))!
    staged.used = true
    const copy = await client.mediaFile.create({ data: mediaCopy(file, staged.storagePath, privatePost), select: { id: true } })
    if (privatePost && exclusive) {
      await client.mediaFile.update({ where: { id: file.id }, data: { private: true } })
    }
    replacements.set(file.id, copy.id)
  }
  const content = rewriteMediaReferences(body.text, replacements)
  const coverImage = rewriteMediaReferences(cover.text, replacements, 'url')
  return {
    data: { ...data, content: content.text, coverImage: coverImage.text || null },
    ids: [...new Set([...content.ids, ...coverImage.ids])],
  }
}

export async function withPostMediaTransaction<T>(
  client: PrismaClient, operation: (transaction: Prisma.TransactionClient, copies: MediaCopies) => Promise<T>
) {
  const copies: MediaCopies = new Map()
  let committed = false
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      for (const copy of copies.values()) copy.used = false
      try {
        const result = await client.$transaction(tx => operation(tx, copies), { timeout: 30_000 })
        committed = true
        return result
      } catch (error) {
        if (!(error instanceof MediaCopiesRequired) || attempt === 2) throw error
        for (const file of error.files) {
          if (copies.has(copyKey(file))) continue
          const storagePath = getStoragePath(file.ext)
          const destination = await ensureMediaDir(storagePath)
          await copyFile(resolveMediaPath(file.storagePath), destination, constants.COPYFILE_EXCL)
          copies.set(copyKey(file), { storagePath, destination, used: false })
        }
      }
    }
    throw new Error('媒体引用变更过于频繁，请重试保存')
  } finally {
    // Failed transactions and copies made obsolete by concurrent edits leave no files.
    await Promise.all([...copies.values()].filter(copy => !committed || !copy.used)
      .map(copy => unlink(copy.destination).catch(() => {})))
  }
}

export { syncPostMedia }
