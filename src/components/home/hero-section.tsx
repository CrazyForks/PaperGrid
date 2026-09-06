import Link from 'next/link'
import Image from 'next/image'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { ArrowUpRight, Github, Mail } from 'lucide-react'
import { isValidHref } from '@/lib/utils'
import { AronaVisual } from './arona-visual'
import { HeroInteraction, HeroWave } from './hero-interaction'
import styles from './hero-section.module.css'

// Official character artwork: https://bluearchive.jp/
// © NEXON Games & Yostar. Artwork is separate from the source code license.
// The local repaired version completes the cropped feet with GPT Image 2.
const arona = existsSync(path.join(process.cwd(), 'public/assets/arona-repaired.webp'))
  ? { src: '/assets/arona-repaired.webp', width: 742, height: 1666 }
  : {
      src: existsSync(path.join(process.cwd(), 'public/assets/arona-cutout.webp'))
        ? '/assets/arona-cutout.webp'
        : 'https://webusstatic.yo-star.com/bluearchive_jp_web/img/men2.db0183c0.png',
      width: 503,
      height: 967,
    }

// GPT Image 2 adaptation of the Arona reference; character artwork is separate from the code license.
const touchArtwork = existsSync(path.join(process.cwd(), 'public/assets/arona-touch-eyes.webp'))
  ? {
      src: '/assets/arona-touch-eyes.webp',
      width: 1254,
      height: 1254,
      touchX: 32.4,
      touchY: 34.8,
      expressions: '/assets/arona-expressions.webp',
    }
  : null

export function HeroSection({ settings = {} }: { settings?: Record<string, unknown> }) {
  const str = (key: string, fallback = '') =>
    typeof settings[key] === 'string' ? String(settings[key]) : fallback
  const title =
    str('hero.typingTitles', '欢迎来到我的博客')
      .split(/[\n|｜]/)
      .map((line) => line.trim())
      .find(Boolean) || '欢迎来到我的博客'
  const letters = Array.from(title)
  const splitTitle = /[\u3400-\u9fff]/.test(title) && letters.length >= 6 && letters.length <= 18
  const midpoint = Math.ceil(letters.length / 2)
  const github = str('profile.contactGithub')
  const email = str('profile.contactEmail')

  return (
    <HeroInteraction>
      <section className={styles.hero} aria-labelledby="hero-title">
        <div className={styles.grid} aria-hidden="true" />
        <div className={styles.body}>
          <div className={styles.copy}>
            <p className={styles.eyebrow}>
              <span aria-hidden="true" />
              与你的日常，就是奇迹
            </p>
            <h1 id="hero-title" className={styles.title}>
              {splitTitle ? (
                <>
                  <span>{letters.slice(0, midpoint).join('')}</span>
                  <span className={styles.titleAccent}>
                    {letters.slice(midpoint).join('')}
                    <i aria-hidden="true" />
                  </span>
                </>
              ) : (
                title
              )}
            </h1>
            <p className={styles.subtitle}>
              {str('hero.subtitle', '写代码，也记一些生活里的小事。')}
            </p>
            <div className={styles.actions}>
              <a href="#latest-posts" className={styles.primary}>
                翻开手记
                <ArrowUpRight size={20} aria-hidden="true" />
              </a>
              <Link href="/about" className={styles.about}>
                认识一下
                <ArrowUpRight size={16} aria-hidden="true" />
              </Link>
            </div>
            {touchArtwork && <HeroWave />}
          </div>

          <div className={`${styles.visual} ${touchArtwork ? styles.visualTouch : ''}`}>
            {touchArtwork ? (
              <AronaVisual artwork={touchArtwork} />
            ) : (
              <Image
                unoptimized
                className={styles.character}
                src={arona.src}
                alt="碧蓝档案的阿罗娜"
                width={arona.width}
                height={arona.height}
                fetchPriority="high"
                decoding="async"
              />
            )}
          </div>
        </div>

        <div className={styles.social}>
          {github && settings['profile.social.github.enabled'] !== false && isValidHref(github) && (
            <a href={github} target="_blank" rel="noopener noreferrer" aria-label="GitHub">
              <Github size={19} />
            </a>
          )}
          {email &&
            settings['profile.social.email.enabled'] !== false &&
            isValidHref(`mailto:${email}`) && (
              <a href={`mailto:${email}`} aria-label="邮件联系">
                <Mail size={19} />
              </a>
            )}
        </div>
      </section>
    </HeroInteraction>
  )
}
