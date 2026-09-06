import { prisma } from './prisma'
import { auth } from './auth'
import { getPostUnlockTokenFromHeaders, verifyPostUnlockToken } from './post-protection'

export async function getMediaAccess(request: Request, mediaId: string): Promise<'public' | 'private' | null> {
  // Never cache authorization: publishing and password changes take effect at once.
  const media = await prisma.mediaFile.findUnique({ where: { id: mediaId }, select: { private: true } })
  if (!media) return null
  const references = await prisma.postMedia.findMany({
    where: { mediaId, post: { OR: [{ isProtected: true }, { status: { not: 'PUBLISHED' } }] } },
    select: { post: { select: { id: true, status: true, passwordHash: true, isProtected: true } } },
  })
  if (!media.private && !references.length) return 'public'
  const session = await auth()
  if (session?.user.role === 'ADMIN') return 'private'
  return references.some(({ post }) => post.status === 'PUBLISHED' && post.isProtected && post.passwordHash &&
    verifyPostUnlockToken(getPostUnlockTokenFromHeaders(request.headers, post.id), post.id, post.passwordHash)) ? 'private' : null
}
