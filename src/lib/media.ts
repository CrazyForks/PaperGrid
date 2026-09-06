import crypto from 'node:crypto'
import path from 'node:path'
import { mkdir } from 'node:fs/promises'
import type { MediaCompressionMode } from '@prisma/client'

const MB = 1024 * 1024

export const MEDIA_MAX_UPLOAD_BYTES = Math.max(
  1,
  Number.parseInt(process.env.MEDIA_MAX_UPLOAD_MB || '10', 10) || 10
) * MB

export const MEDIA_MAX_INPUT_PIXELS = Math.max(
  1_000_000,
  Number.parseInt(process.env.MEDIA_MAX_INPUT_PIXELS || '12000000', 10) || 12_000_000
)

export const MEDIA_ROOT = process.env.MEDIA_ROOT ||
  (process.env.NODE_ENV === 'production'
    ? '/data/uploads'
    : path.join(process.cwd(), '.local', 'uploads'))

export const MEDIA_URL_PREFIX = '/api/files'

export const ALLOWED_IMAGE_TYPES = new Map<string, string>([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
  ['image/avif', 'avif'],
])

const COMPRESSION_MODES = new Set<MediaCompressionMode>(['ORIGINAL', 'BALANCED', 'HIGH'])

export function parseCompressionMode(value: unknown): MediaCompressionMode {
  if (typeof value !== 'string') return 'BALANCED'
  const normalized = value.toUpperCase()
  return COMPRESSION_MODES.has(normalized as MediaCompressionMode)
    ? (normalized as MediaCompressionMode)
    : 'BALANCED'
}

export function getStoragePath(ext: string, at = new Date()) {
  const yyyy = at.getUTCFullYear()
  const mm = String(at.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(at.getUTCDate()).padStart(2, '0')
  const random = crypto.randomUUID().replace(/-/g, '')
  return `${yyyy}/${mm}/${dd}/${random}.${ext}`
}

export function resolveMediaPath(storagePath: string) {
  const safeRelative = path.posix.normalize(storagePath).replace(/^\.\/+/, '')
  const root = path.resolve(/* turbopackIgnore: true */ MEDIA_ROOT)
  const absolute = path.resolve(root, safeRelative)

  if (!absolute.startsWith(root + path.sep) && absolute !== root) {
    throw new Error('非法文件路径')
  }

  return absolute
}

export async function ensureMediaDir(storagePath: string) {
  const absolute = resolveMediaPath(storagePath)
  await mkdir(path.dirname(absolute), { recursive: true })
  return absolute
}

export function mediaUrlById(id: string) {
  return `${MEDIA_URL_PREFIX}/${id}`
}

export function sha256Hex(content: Buffer) {
  return crypto.createHash('sha256').update(content).digest('hex')
}
