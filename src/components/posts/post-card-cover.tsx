interface PostCardCoverProps { coverImage: string; title: string; sizes?: string; priority?: boolean }
export function PostCardCover({ coverImage, title, priority = false }: PostCardCoverProps) {
  return <div className="relative mx-6 mt-1 aspect-[2/1] overflow-hidden rounded-lg bg-muted"><img src={coverImage} alt={title} loading={priority ? 'eager' : 'lazy'} decoding="async" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]" /></div>
}
