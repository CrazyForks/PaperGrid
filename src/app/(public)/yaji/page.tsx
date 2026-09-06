import { prisma } from '@/lib/prisma'
import type { Metadata } from 'next'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import Link from 'next/link'
import { ArchiveHeading } from '@/components/layout/archive-heading'

export const revalidate = 60

export const metadata: Metadata = {
  title: '雅集',
  description: '精选项目与作品展示，记录创作与实践。',
  alternates: {
    canonical: '/yaji',
  },
}

export default async function YajiPage() {
  const projects = await prisma.project.findMany({
    orderBy: { createdAt: 'desc' },
  })

  return (
    <section className="ba-works-page pb-12">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <ArchiveHeading title="雅集" />

        {projects.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-gray-500 dark:text-gray-400">
              暂无作品，稍后再来看看吧。
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => {
              const fallback = project.name?.charAt(0).toUpperCase() || '作'
              return (
                <Link
                  key={project.id}
                  href={project.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group block"
                >
                  <Card className="h-full border-gray-200 transition-shadow hover:shadow-lg dark:border-gray-800">
                    <div className="flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-t-lg bg-gray-100 dark:bg-gray-800">
                      {project.image ? (
                        <img
                          src={project.image}
                          alt={project.name}
                          className="h-full w-full object-cover"
                          loading="lazy"
                          decoding="async"
                        />
                      ) : (
                        <span className="font-serif text-5xl font-bold text-gray-900 dark:text-white">
                          {fallback}
                        </span>
                      )}
                    </div>
                    <CardContent className="p-4">
                      <h3 className="text-lg font-semibold text-gray-900 group-hover:text-blue-600 dark:text-white dark:group-hover:text-blue-400">
                        {project.name}
                      </h3>
                      {project.description && (
                        <p className="mt-2 line-clamp-3 text-sm text-gray-600 dark:text-gray-400">
                          {project.description}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </section>
  )
}
