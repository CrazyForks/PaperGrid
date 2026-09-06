import { Parser } from 'htmlparser2'

// Shared by normal writes and the one-time legacy upgrade. Parse URL tokens once,
// rather than testing every file ID against every character of a post.
const urlToken = /(?:https?:[/\\]{2}|(?:\.{1,2}[/\\])+|[/\\]|&(?:sol;|bsol;|#0*47;?|#x0*2f;?))[^\s<>"'`()\[\]{}]*/gi

/** @param {string} value */
function decodeAttribute(value) {
  let decoded = value
  if (!value.includes('&')) return decoded
  const escaped = value.replace(/"/g, '&quot;').replace(/</g, '&lt;')
  new Parser({ onattribute(name, value) {
    if (name === 'href') decoded = value
  } }).end(`<a href="${escaped}"></a>`)
  return decoded
}

/**
 * Root-relative and same-origin absolute URLs are canonicalized. External URLs
 * are left untouched even if they happen to use our file route.
 * @param {string} text
 * @param {Map<string, string>} replacements
 * @param {'markdown' | 'url'} mode
 */
export function rewriteMediaReferences(text, replacements = new Map(), mode = 'markdown') {
  /** @type {Set<string>} */
  const ids = new Set()
  const origin = new URL(process.env.NEXTAUTH_URL || 'http://localhost:3000').origin
  const normalizeUrl = (token, decodeEntities = true) => {
    try {
      const url = new URL((decodeEntities ? decodeAttribute(token) : token).replace(/\\([/])/g, '$1'), `${origin}/`)
      if (url.origin !== origin) return null
      // The router decodes parameters; URL handles dot segments, including %2e.
      const pathname = decodeURIComponent(url.pathname)
      const match = /^\/api\/files\/([A-Za-z0-9_-]+)\/?$/.exec(pathname)
      if (!match) return null
      const id = replacements.get(match[1]) || match[1]
      ids.add(id)
      return `/api/files/${id}${url.search}${url.hash}`
    } catch { return null }
  }
  // Cover fields contain one URL; unlike Markdown, browser URL normalization
  // may remove embedded tabs/newlines throughout that value.
  if (mode === 'url') return { text: normalizeUrl(text) ?? text, ids: [...ids] }
  // Parse attribute boundaries and entities with the same HTML rules used by
  // the renderer. Only replace value slices: serializing a DOM would change the
  // surrounding Markdown, quotation style, whitespace and entity spelling.
  const source = text
  const parts = []
  let cursor = 0
  let attributes = []
  const parser = new Parser({
    onopentagname() { attributes = [] },
    onattribute(name, value, quote) {
      attributes.push({ name, value, quote, start: parser.startIndex, end: parser.endIndex })
    },
    onopentag(_name, _attributes, implied) {
      if (implied) return
      const start = parser.startIndex
      const end = parser.endIndex + 1
      parts.push(source.slice(cursor, start).replace(urlToken, token => normalizeUrl(token) ?? token))
      // Markdown autolinks look like opening tags to an HTML parser. Keep
      // their absolute-URL syntax so normalization does not turn them into text.
      const autolink = /^<(https?:\/\/[^<>\s]+)>$/i.exec(source.slice(start, end))
      if (autolink) {
        const normalized = normalizeUrl(autolink[1])
        parts.push(normalized === null ? autolink[0] : `<${origin}${normalized}>`)
        cursor = end
        return
      }
      let tagCursor = start
      const seen = new Set()
      for (const attribute of attributes) {
        const { name, value, quote } = attribute
        // HTML retains the first duplicate attribute, including an empty value.
        if (seen.has(name)) continue
        seen.add(name)
        if (!['src', 'href', 'poster'].includes(name) || quote === undefined) continue
        const normalized = normalizeUrl(value, false)
        if (normalized === null) continue
        const raw = source.slice(attribute.start, attribute.end)
        const prefix = /^[^=]+=[\t\n\f\r ]*/.exec(raw)
        if (!prefix) continue
        const valueStart = attribute.start + prefix[0].length + (quote ? 1 : 0)
        const valueEnd = attribute.end - (quote ? 1 : 0)
        const escaped = normalized.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
        parts.push(source.slice(tagCursor, valueStart), escaped)
        tagCursor = valueEnd
      }
      parts.push(source.slice(tagCursor, end))
      cursor = end
    },
  })
  parser.end(source)
  parts.push(source.slice(cursor).replace(urlToken, token => normalizeUrl(token) ?? token))
  const normalized = parts.join('')
  return { text: normalized, ids: [...ids] }
}

/** @param {string[]} ids */
export function mediaIdBatches(ids) {
  return Array.from({ length: Math.ceil(ids.length / 200) }, (_, i) => ids.slice(i * 200, (i + 1) * 200))
}

/** @param {import('@prisma/client').MediaFile} file @param {string} storagePath @param {boolean} isPrivate */
export function mediaCopy(file, storagePath, isPrivate) {
  return {
    originalName: file.originalName, storagePath, mimeType: file.mimeType,
    ext: file.ext, size: file.size, width: file.width, height: file.height,
    sha256: file.sha256, compressionMode: file.compressionMode,
    uploadedById: file.uploadedById, uploadedByApiKeyId: file.uploadedByApiKeyId ?? null, private: isPrivate,
  }
}

/**
 * Must run in the same transaction as the Post write. Removed references do not
 * make abandoned private uploads public.
 * @param {import('@prisma/client').Prisma.TransactionClient} client
 * @param {string} postId
 * @param {string[]} ids
 */
export async function syncPostMedia(client, postId, ids) {
  await client.postMedia.deleteMany({ where: { postId } })
  for (const batch of mediaIdBatches([...new Set(ids)])) {
    const files = await client.mediaFile.findMany({ where: { id: { in: batch } }, select: { id: true } })
    if (!files.length) continue
    const found = files.map(file => file.id)
    await client.postMedia.createMany({ data: found.map(mediaId => ({ postId, mediaId })) })
    const privateReference = { post: { OR: [{ isProtected: true }, { status: { not: /** @type {const} */ ('PUBLISHED') } }] } }
    await client.mediaFile.updateMany({
      where: { id: { in: found }, postReferences: { some: privateReference } }, data: { private: true },
    })
    await client.mediaFile.updateMany({
      where: { id: { in: found }, postReferences: { none: privateReference } }, data: { private: false },
    })
  }
}
