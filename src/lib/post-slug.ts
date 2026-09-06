import { randomBytes } from 'node:crypto'
import { Prisma } from '@prisma/client'

export function generatePostSlug() {
  // 96 random bits in 16 URL-safe characters; independent of title and language.
  return randomBytes(12).toString('base64url')
}

export async function createPostWithSlug<T>(
  create: (slug: string) => Promise<T>,
  generate = generatePostSlug
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await create(generate())
    } catch (error) {
      const target = error instanceof Prisma.PrismaClientKnownRequestError ? error.meta?.target : undefined
      const slugConflict = error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002' && Array.isArray(target) && target.length === 1 && target[0] === 'slug'
      if (!slugConflict || attempt >= 4) throw error
    }
  }
}
