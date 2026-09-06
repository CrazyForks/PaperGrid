import { parse as parseYaml } from 'yaml'
import { parse as parseToml } from 'smol-toml'

type ParsedMap = Record<string, unknown>

export type ParsedFrontMatter = {
  format: 'yaml' | 'toml' | 'json' | 'none'
  body: string
  fields: {
    title?: string
    slug?: string
    date?: Date
    updated?: Date
    tags: string[]
    categories: string[]
    published?: boolean
    isProtected?: boolean
  }
}

const KEY_ALIASES = {
  title: ['title'],
  slug: ['slug'],
  date: ['date'],
  updated: ['updated', 'lastmod'],
  tags: ['tags', 'tag'],
  categories: ['categories', 'category'],
  published: ['published'],
  isProtected: ['isProtected'],
} as const

const DRAFT_ALIASES = ['draft'] as const

function stripBom(input: string) {
  return input.replace(/^\ufeff/, '')
}

function normalizeString(input: unknown): string | undefined {
  if (typeof input !== 'string') return undefined
  const trimmed = input.trim()
  return trimmed ? trimmed : undefined
}

function normalizeStringList(input: unknown): string[] {
  if (Array.isArray(input)) {
    const values = input
      .map((item) => normalizeString(item))
      .filter((item): item is string => Boolean(item))
    return Array.from(new Set(values))
  }

  const value = normalizeString(input)
  if (!value) return []
  return [value]
}

function normalizeBoolean(input: unknown): boolean | undefined {
  if (typeof input === 'boolean') return input
  if (typeof input !== 'string') return undefined
  const normalized = input.trim().toLowerCase()
  if (normalized === 'true') return true
  if (normalized === 'false') return false
  return undefined
}

function normalizeDate(input: unknown): Date | undefined {
  if (input instanceof Date) {
    return Number.isNaN(input.getTime()) ? undefined : input
  }

  if (typeof input !== 'string') return undefined
  const raw = input.trim()
  if (!raw) return undefined

  const firstTry = new Date(raw)
  if (!Number.isNaN(firstTry.getTime())) return firstTry

  const slashNormalized = raw.replace(/\//g, '-')
  const secondTry = new Date(slashNormalized)
  if (!Number.isNaN(secondTry.getTime())) return secondTry

  return undefined
}

function asMap(value: unknown): ParsedMap {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as ParsedMap
}

function parseYamlBlock(block: string): ParsedMap {
  return asMap(parseYaml(block, { maxAliasCount: 100 }))
}

function parseJsonLikeBlock(block: string): ParsedMap {
  const trimmed = block.trim()

  const asJsonObject = (() => {
    try {
      return JSON.parse(trimmed) as ParsedMap
    } catch {
      return null
    }
  })()
  if (asJsonObject && typeof asJsonObject === 'object' && !Array.isArray(asJsonObject)) {
    return asJsonObject
  }

  const wrapped = (() => {
    try {
      return JSON.parse(`{${trimmed}}`) as ParsedMap
    } catch {
      return null
    }
  })()
  if (wrapped && typeof wrapped === 'object' && !Array.isArray(wrapped)) {
    return wrapped
  }

  const result: ParsedMap = {}
  const lines = block.replace(/\r\n/g, '\n').split('\n')

  for (const line of lines) {
    const match = line.match(/^\s*"?([A-Za-z_][\w-]*)"?\s*:\s*(.+?)\s*,?\s*$/)
    if (!match) continue
    const key = match[1]
    const value: unknown = parseYaml(match[2].replace(/,\s*$/, ''), { maxAliasCount: 100 })
    result[key] = value
  }

  return result
}

function parseTomlBlock(block: string): ParsedMap {
  return asMap(parseToml(block))
}

function pickByAliases(record: ParsedMap, aliases: readonly string[]) {
  for (const key of aliases) {
    if (Object.prototype.hasOwnProperty.call(record, key)) {
      return record[key]
    }
  }
  return undefined
}

function toFields(record: ParsedMap): ParsedFrontMatter['fields'] {
  const explicitPublished = normalizeBoolean(pickByAliases(record, KEY_ALIASES.published))
  const draft = normalizeBoolean(pickByAliases(record, DRAFT_ALIASES))
  const published = explicitPublished ?? (draft === undefined ? undefined : !draft)

  return {
    title: normalizeString(pickByAliases(record, KEY_ALIASES.title)),
    slug: normalizeString(pickByAliases(record, KEY_ALIASES.slug)),
    date: normalizeDate(pickByAliases(record, KEY_ALIASES.date)),
    updated: normalizeDate(pickByAliases(record, KEY_ALIASES.updated)),
    tags: normalizeStringList(pickByAliases(record, KEY_ALIASES.tags)),
    categories: normalizeStringList(pickByAliases(record, KEY_ALIASES.categories)),
    published,
    isProtected: normalizeBoolean(pickByAliases(record, KEY_ALIASES.isProtected)),
  }
}

function looksLikeJsonFrontMatterCandidate(block: string) {
  return /"(title|date|updated|tags|categories|published|lastmod)"\s*:|(?:^|\n)\s*(title|date|updated|tags|categories|published|lastmod)\s*:/i.test(block)
}

export function parseFrontMatter(markdown: string): ParsedFrontMatter {
  const content = stripBom(markdown).replace(/\r\n/g, '\n')

  const tomlMatch = content.match(/^\+\+\+\s*\n([\s\S]*?)\n\+\+\+\s*(?:\n|$)/)
  if (tomlMatch) {
    return {
      format: 'toml',
      fields: toFields(parseTomlBlock(tomlMatch[1])),
      body: content.slice(tomlMatch[0].length),
    }
  }

  const yamlMatch = content.match(/^---\s*\n([\s\S]*?)\n---\s*(?:\n|$)/)
  if (yamlMatch) {
    return {
      format: 'yaml',
      fields: toFields(parseYamlBlock(yamlMatch[1])),
      body: content.slice(yamlMatch[0].length),
    }
  }

  const jsonDelimitedMatch = content.match(/^;;;\s*\n([\s\S]*?)\n;;;\s*(?:\n|$)/)
  if (jsonDelimitedMatch) {
    return {
      format: 'json',
      fields: toFields(parseJsonLikeBlock(jsonDelimitedMatch[1])),
      body: content.slice(jsonDelimitedMatch[0].length),
    }
  }

  const jsonEndOnlyMatch = content.match(/^([\s\S]{1,5000}?)\n;;;\s*(?:\n|$)/)
  if (jsonEndOnlyMatch) {
    const candidate = jsonEndOnlyMatch[1].trim()
    if (looksLikeJsonFrontMatterCandidate(candidate)) {
      return {
        format: 'json',
        fields: toFields(parseJsonLikeBlock(candidate)),
        body: content.slice(jsonEndOnlyMatch[0].length),
      }
    }
  }

  return {
    format: 'none',
    body: content,
    fields: {
      tags: [],
      categories: [],
    },
  }
}

function quoteYaml(value: string) {
  return JSON.stringify(value)
}

export function buildYamlFrontMatter(input: {
  title: string
  slug?: string
  date: Date
  updated?: Date | null
  tags?: string[]
  categories?: string[]
  published?: boolean
  isProtected?: boolean
}) {
  const lines: string[] = []
  lines.push('---')
  lines.push(`title: ${quoteYaml(input.title)}`)
  if (input.slug) {
    lines.push(`slug: ${quoteYaml(input.slug)}`)
  }
  lines.push(`date: ${quoteYaml(input.date.toISOString())}`)
  if (typeof input.published === 'boolean') {
    lines.push(`published: ${input.published}`)
  }

  if (typeof input.isProtected === 'boolean') {
    lines.push(`isProtected: ${input.isProtected}`)
  }

  if (input.updated) {
    lines.push(`updated: ${quoteYaml(input.updated.toISOString())}`)
  }

  const tags = Array.from(new Set((input.tags || []).map((it) => it.trim()).filter(Boolean)))
  if (tags.length > 0) {
    lines.push('tags:')
    for (const tag of tags) {
      lines.push(`  - ${quoteYaml(tag)}`)
    }
  } else {
    lines.push('tags: []')
  }

  const categories = Array.from(new Set((input.categories || []).map((it) => it.trim()).filter(Boolean)))
  if (categories.length > 0) {
    lines.push('categories:')
    for (const category of categories) {
      lines.push(`  - ${quoteYaml(category)}`)
    }
  } else {
    lines.push('categories: []')
  }

  lines.push('---')
  return `${lines.join('\n')}\n`
}
