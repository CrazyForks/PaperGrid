// Shared by taxonomy forms and server validation. Article URLs use random IDs.
export const MAX_SLUG_LENGTH = 200

export function isValidSlug(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_SLUG_LENGTH &&
    /^[\p{L}\p{N}_-][\p{L}\p{N}\p{M}_-]*$/u.test(value)
}

export function generateTaxonomySlug(name: string) {
  return name.normalize('NFKC').toLowerCase().trim()
    .replace(/[^\p{L}\p{N}\p{M}\s_-]/gu, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/g, '')
}

export function taxonomyNameChange<T extends { name: string; slug: string }>(
  current: T, name: string, slugEdited: boolean
): T {
  return { ...current, name, slug: slugEdited ? current.slug : generateTaxonomySlug(name) }
}
