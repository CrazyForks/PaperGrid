export type ChangelogItem = {
  version: string
  date: string
  highlights: string[]
}

export const CHANGELOG: ChangelogItem[] = [
  { version: '1.1.4', date: '2026-09-07', highlights: [
    '暗色模式新增普拉娜首页与加载表情，支持眨眼和轻触互动。',
    '优化 404 页面，修复跟随系统主题时首次切换不生效的问题。',
  ] },
  { version: '1.1.3', date: '2026-09-06', highlights: [
    '修复了部分布局和兼容性问题',
  ] },
  { version: '1.1.2', date: '2026-09-06', highlights: [
    '移除首屏跳过按钮，修复手机端加载动画错位与页面切换回弹。',
  ] },
  { version: '1.1.1', date: '2026-09-06', highlights: [
    '修复 Docker 镜像缺少启动依赖导致首次部署和升级失败的问题。',
  ] },
  { version: '1.1.0', date: '2026-09-05', highlights: [
    'Schale 蓝白界面：重构首页、阅读布局、移动导航、登录页与创作工作室。',
    '强化会话撤销、加密图片和附件、请求边界、反向代理限流与公网 HTTPS 外发。',
    '补齐文件、评论、AI 会话分页；限制图像和 AI 并发，优化向量化与导出任务。',
    '支持从 1.0.30 增量迁移，自动分离私有文件并轮换历史默认弱密码。',
  ] },
  {
    version: 'v1.0.30',
    date: '2026-03-30',
    highlights: [
      '优化页脚信息展示。',
    ],
  },
  {
    version: 'v1.0.29',
    date: '2026-03-12',
    highlights: [
      '优化缓存策略。',
    ],
  },
  {
    version: 'v1.0.27',
    date: '2026-03-11',
    highlights: [
      '性能优化。',
    ],
  },
  {
    version: 'v1.0.25',
    date: '2026-03-06',
    highlights: [
      '封面视觉效果优化。',
    ],
  },
  {
    version: 'v1.0.23',
    date: '2026-03-06',
    highlights: [
      'SEO优化。',
    ],
  },
  {
    version: 'v1.0.22',
    date: '2026-03-05',
    highlights: [
      '安全性更新。',
    ],
  },
  {
    version: 'v1.0.21',
    date: '2026-02-28',
    highlights: [
        '新增后台样式管理，可一键切换前台预设主题。',
    ],
  },
  {
    version: 'v1.0.12',
    date: '2026-02-25',
    highlights: [
      '新增智能AI助手。',
    ],
  },
  {
    version: 'v1.0.8',
    date: '2026-02-14',
    highlights: [
      '备份迁移功能上线。',
    ],
  },
]
