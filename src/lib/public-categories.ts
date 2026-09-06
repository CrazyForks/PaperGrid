import { unstable_cache } from 'next/cache'
import { prisma } from './prisma'

export const PUBLIC_CATEGORIES_CACHE_TAG = 'categories:public'

export type PublicCategoryItem = {
  id: string
  name: string
  slug: string
  description: string | null
  _count: {
    posts: number
  }
}

export async function getPublicCategories(limit?: number) {
  const normalizedLimit = typeof limit === 'number' && limit > 0 ? Math.floor(limit) : null

  return unstable_cache(
    async () =>
      prisma.category.findMany({
        include: {
          _count: {
            select: {
              posts: { where: { status: 'PUBLISHED' } },
            },
          },
        },
        orderBy: {
          name: 'asc',
        },
        ...(normalizedLimit ? { take: normalizedLimit } : {}),
      }),
    ['public-categories', String(normalizedLimit ?? 'all')],
    {
      tags: [PUBLIC_CATEGORIES_CACHE_TAG],
      revalidate: false,
    }
  )() as Promise<PublicCategoryItem[]>
}
