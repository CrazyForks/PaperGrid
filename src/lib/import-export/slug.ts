import { createHash } from 'node:crypto'
import { isValidSlug } from '../slug'

export function resolveImportSlug(explicit: string | undefined, fileName: string) {
  if (explicit !== undefined) {
    if (!isValidSlug(explicit)) throw new Error('源 Slug 无效，请使用合法的单段路径')
    // Keep identity, case and Chinese characters, including exported random IDs.
    return explicit
  }
  const path = fileName.replace(/\\/g, '/').normalize('NFC')
  const base = path.split('/').pop()!.replace(/\.[^.]+$/, '')
  // Nested bundles often all use index.md. Include their path in the identity.
  if (!path.includes('/') && isValidSlug(base)) return base
  // File identity stays stable across repeated imports; never use time or title.
  return `import-${createHash('sha256').update(path).digest('hex').slice(0, 24)}`
}

export function assertDistinctImportSlugs(posts: Array<{ slug: string; originFile: string }>) {
  const seen = new Map<string, string>()
  for (const post of posts) {
    const previous = seen.get(post.slug)
    if (previous !== undefined) {
      throw new Error(`导入文件「${previous}」与「${post.originFile}」使用相同 Slug「${post.slug}」，请修改后重试；本批次尚未写入`)
    }
    seen.set(post.slug, post.originFile)
  }
}
