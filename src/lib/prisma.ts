import { PrismaClient } from '@prisma/client'
import { isolatePostMedia, syncPostMedia, withPostMediaTransaction, type PrivateMediaAccess } from './post-media-write'
import { withIdempotency, type IdempotencyIdentity } from './api-idempotency'

function createClient() {
  const url = process.env.DATABASE_URL
  // Keep SQLite writes serialized; media file I/O is staged outside transactions.
  const datasourceUrl = url?.startsWith('file:') && !url.includes('connection_limit=')
    ? `${url}${url.includes('?') ? '&' : '?'}connection_limit=1` : url
  const client = new PrismaClient({ ...(datasourceUrl ? { datasourceUrl } : {}) })
  return { client, writer: createPostWriter(client), pluginReadWriter: createPostWriter(client, 'referenced'), pluginWriteWriter: createPostWriter(client, 'none') }
}

function createPostWriter(client: PrismaClient, privateMediaAccess: PrivateMediaAccess = 'all', idempotency?: IdempotencyIdentity, onCreated?: () => void) {
  return client.$extends({ query: { post: {
    async create({ args }) {
      let created = false
      const result = await withPostMediaTransaction(client, async (tx, copies) => withIdempotency(tx, idempotency, async () => {
        const prepared = await isolatePostMedia(tx, args.data, copies, undefined, privateMediaAccess)
        const result = await tx.post.create({ data: prepared.data })
        await syncPostMedia(tx, result.id, prepared.ids)
        created = true
        if (!args.select && !args.include && !args.omit) return result
        if (args.select) return tx.post.findUniqueOrThrow({ where: { id: result.id }, select: args.select })
        return tx.post.findUniqueOrThrow({ where: { id: result.id }, include: args.include, omit: args.omit })
      }))
      // Only the request that committed a new article should invalidate caches.
      if (created) onCreated?.()
      return result
    },
    async update({ args, query }) {
      if (!['content', 'coverImage', 'isProtected', 'status'].some(key => key in args.data)) return query(args)
      return withPostMediaTransaction(client, async (tx, copies) => {
        const prepared = await isolatePostMedia(tx, args.data, copies, args.where, privateMediaAccess)
        const result = await tx.post.update({ where: args.where, data: prepared.data })
        await syncPostMedia(tx, result.id, prepared.ids)
        if (!args.select && !args.include && !args.omit) return result
        if (args.select) return tx.post.findUniqueOrThrow({ where: { id: result.id }, select: args.select })
        return tx.post.findUniqueOrThrow({ where: { id: result.id }, include: args.include, omit: args.omit })
      })
    },
    async upsert({ args }) {
      return withPostMediaTransaction(client, async (tx, copies) => {
        const existing = await tx.post.findUnique({ where: args.where, select: { id: true } })
        const saved = await (async () => {
          if (existing) {
            const prepared = await isolatePostMedia(tx, args.update, copies, { id: existing.id }, privateMediaAccess)
            return { result: await tx.post.update({ where: args.where, data: prepared.data }), ids: prepared.ids }
          }
          const prepared = await isolatePostMedia(tx, args.create, copies, undefined, privateMediaAccess)
          return { result: await tx.post.create({ data: prepared.data }), ids: prepared.ids }
        })()
        await syncPostMedia(tx, saved.result.id, saved.ids)
        if (!args.select && !args.include && !args.omit) return saved.result
        if (args.select) return tx.post.findUniqueOrThrow({ where: { id: saved.result.id }, select: args.select })
        return tx.post.findUniqueOrThrow({ where: { id: saved.result.id }, include: args.include, omit: args.omit })
      })
    },
  } } })
}

const state = globalThis as typeof globalThis & { __papergridPrisma?: ReturnType<typeof createClient> }
const database = state.__papergridPrisma ??= createClient()
export const prisma = database.client
export const postWriter = database.writer

// POST_READ grants access to article-bound media, not unattached private uploads.
export const getPluginPostWriter = (canReadPosts: boolean, apiKeyId?: string, idempotency?: IdempotencyIdentity, onCreated?: () => void) =>
  apiKeyId ? createPostWriter(prisma, { canReadPosts, apiKeyId }, idempotency, onCreated)
    : canReadPosts ? database.pluginReadWriter : database.pluginWriteWriter
