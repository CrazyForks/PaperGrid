import { TriangleLoader } from '@/components/loading/triangle-loader'
import styles from '@/components/loading/loading.module.css'

export default function Loading() {
  return (
    <div className={styles.route} role="status" data-route-loading>
      <TriangleLoader />
      <span>正在加载…</span>
    </div>
  )
}
