import type { Metadata } from 'next'
import './globals.css'
import { ThemeProvider } from '@/components/theme/theme-provider'
import { SessionProvider } from '@/components/auth/session-provider'
import { Toaster } from '@/components/ui/toaster'
import { getSetting } from '@/lib/settings'
import { getSiteUrl } from '@/lib/seo'
import { ScrollProgress } from '@/components/layout/scroll-progress'

export async function generateMetadata(): Promise<Metadata> {
  const title = (await getSetting<string>('site.title', '执笔为剑')) || '执笔为剑'
  const description = await getSetting<string>(
    'site.description',
    '分享技术文章、生活记录和作品展示的个人博客'
  )
  const faviconUrl = (await getSetting<string>('site.faviconUrl', '')) || ''
  const metadataBase = getSiteUrl()

  return {
    metadataBase,
    title: {
      default: title,
      template: `%s | ${title}`,
    },
    description,
    alternates: {
      canonical: '/',
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        'max-image-preview': 'large',
        'max-snippet': -1,
        'max-video-preview': -1,
      },
    },
    openGraph: {
      type: 'website',
      locale: 'zh_CN',
      url: '/',
      siteName: title,
      title,
      description,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
    ...(faviconUrl ? { icons: { icon: faviconUrl } } : {}),
  }
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const theme = await getSetting<string>('site.defaultTheme', 'system')
  return (
    <html lang="zh" data-scroll-behavior="smooth" suppressHydrationWarning>
      <body id="papergrid-page" className="font-sans antialiased">
        <SessionProvider>
          <ThemeProvider
            attribute="class"
            defaultTheme={theme || 'system'}
            enableSystem
            disableTransitionOnChange
          >
            {children}
            <Toaster />
            <ScrollProgress />
          </ThemeProvider>
        </SessionProvider>
      </body>
    </html>
  )
}
