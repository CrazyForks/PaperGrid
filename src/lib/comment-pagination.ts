import type { Prisma } from '@prisma/client'

const PAGE_SIZE = 30

/** Call only after checking access to the post. All lookups share a read transaction. */
export async function getCommentPage(
  db: Pick<Prisma.TransactionClient, 'comment'>,
  postId: string,
  requestedPage: number,
  targetId?: string | null,
) {
  const where = { postId, status: 'APPROVED' as const }
  const total = await db.comment.count({ where })
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  let page = Math.min(requestedPage, totalPages)
  const target = targetId ? await db.comment.findFirst({
    where: { ...where, id: targetId }, select: { id: true, createdAt: true },
  }) : null
  if (target) {
    const preceding = await db.comment.count({ where: {
      ...where,
      OR: [
        { createdAt: { lt: target.createdAt } },
        { createdAt: target.createdAt, id: { lt: target.id } },
      ],
    } })
    page = Math.floor(preceding / PAGE_SIZE) + 1
  }
  const comments = await db.comment.findMany({
    where,
    select: {
      id: true, content: true, createdAt: true, authorName: true, parentId: true,
      author: { select: { name: true, image: true } },
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE,
  })
  const visibleIds = new Set(comments.map(comment => comment.id))
  const parentIds = [...new Set(comments.flatMap(comment =>
    comment.parentId && !visibleIds.has(comment.parentId) ? [comment.parentId] : [],
  ))]
  // Only immediate parents, at most one per page item; never walk unbounded reply chains.
  const parents = parentIds.length ? await db.comment.findMany({
    where: { ...where, id: { in: parentIds } },
    select: { id: true, content: true, authorName: true, author: { select: { name: true } } },
    take: PAGE_SIZE,
  }) : []
  return {
    comments,
    parentContexts: parents.map(parent => ({
      id: parent.id,
      authorName: parent.author?.name || parent.authorName || '匿名用户',
      excerpt: parent.content.slice(0, 120),
    })),
    targetFound: Boolean(target),
    pagination: { page, total, totalPages },
  }
}
