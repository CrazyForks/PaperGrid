import { ArrowLeft, ArrowUpRight } from 'lucide-react'
import Link from 'next/link'
import styles from './not-found.module.css'

export default function NotFound() {
  return (
    <section className={styles.page} aria-labelledby="not-found-title">
      <div className={styles.grid} aria-hidden="true" />
      <div className={styles.content}>
        <div className={styles.scene} aria-hidden="true">
          <div className={styles.orbit}>
            <span className={styles.sparkTrack}>
              <span className={styles.spark} />
            </span>
          </div>
          <div className={styles.code}>404</div>
        </div>
        <div className={styles.copy}>
          <p className={styles.eyebrow}>404 / NOT FOUND</p>
          <h1 id="not-found-title">这页找不到了</h1>
          <p className={styles.description}>链接可能有误，或页面已被移走。</p>
          <div className={styles.actions}>
            <Link href="/" className={styles.primary}>
              <ArrowLeft size={18} aria-hidden="true" />
              返回首页
            </Link>
            <Link href="/posts" className={styles.secondary}>
              浏览文章
              <ArrowUpRight size={18} aria-hidden="true" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}
