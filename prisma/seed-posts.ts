import { prisma, postWriter } from '../src/lib/prisma'

const posts = [
  {
    id: 'post-001',
    title: 'Next.js 14 App Router 完全指南',
    slug: 'nextjs-14-app-router-guide',
    content: `# Next.js 14 App Router 完全指南

## 简介

Next.js 14 引入了许多新特性，其中最重要的是 App Router。本文将详细介绍如何使用 App Router 构建现代化的 Web 应用。

## 什么是 App Router？

App Router 是 Next.js 13 引入的新路由系统，基于 React Server Components 构建。

### 主要特性

- **React Server Components**: 默认使用服务器组件
- **Streaming**: 支持流式渲染
- **Transitions**: 更好的导航体验
- **Layouts**: 嵌套布局

## 创建新项目

\`\`\`bash
pnpm create next-app@latest my-app
\`\`\`

## 项目结构

\`\`\`
app/
├── layout.tsx
├── page.tsx
├── about/
│   └── page.tsx
└── blog/
    ├── page.tsx
    └── [slug]/
        └── page.tsx
\`\`\`

## 总结

App Router 是 Next.js 的未来，值得学习和使用。`,
    excerpt: '本文详细介绍 Next.js 14 App Router 的使用方法，包括 React Server Components、Streaming 等新特性。',
    categoryId: 'cat-tech-001',
    tagNames: ['Next.js', '前端开发', '全栈开发'],
    readingTime: 8,
    publishedDaysAgo: 5,
  },
  {
    id: 'post-002',
    title: 'TypeScript 最佳实践',
    slug: 'typescript-best-practices',
    content: `# TypeScript 最佳实践

## 类型基础

TypeScript 为 JavaScript 添加了静态类型检查。

### 接口 vs 类型别名

\`\`\`typescript
// 接口
interface User {
  name: string;
  age: number;
}

// 类型别名
type User = {
  name: string;
  age: number;
};
\`\`\`

## 泛型

泛型让代码更加灵活。

## 类型守卫

使用类型守卫缩小类型范围。

## 总结

TypeScript 是大型项目的首选语言。`,
    excerpt: '分享 TypeScript 开发中的最佳实践，包括类型定义、泛型使用、类型守卫等技巧。',
    categoryId: 'cat-tech-001',
    tagNames: ['TypeScript', '前端开发'],
    readingTime: 6,
    publishedDaysAgo: 4,
  },
  {
    id: 'post-003',
    title: '使用 Prisma 构建数据库层',
    slug: 'prisma-database-layer',
    content: `# 使用 Prisma 构建数据库层

## 什么是 Prisma？

Prisma 是现代化的 ORM，让数据库操作变得简单。

### 主要优势

- 类型安全
- 自动生成 TypeScript 类型
- 迁移管理
- 查询构建器

## Schema 定义

在 schema.prisma 文件中定义数据模型。

## 数据库查询

使用 Prisma Client 进行类型安全的数据库查询。

## 迁移

使用 Prisma Migrate 管理数据库迁移。

## 总结

Prisma 大大提升了开发效率。`,
    excerpt: '详细介绍如何使用 Prisma ORM 构建类型安全的数据库层，包括 schema 定义、查询和迁移。',
    categoryId: 'cat-tutorial-003',
    tagNames: ['Prisma', '后端开发', '数据库'],
    readingTime: 7,
    publishedDaysAgo: 3,
  },
  {
    id: 'post-004',
    title: 'TailwindCSS 实用技巧',
    slug: 'tailwindcss-tips',
    content: `# TailwindCSS 实用技巧

## 为什么选择 TailwindCSS？

TailwindCSS 是功能类优先的 CSS 框架。

### 快速开发

使用工具类快速构建 UI。

## 自定义配置

在 tailwind.config.js 中自定义主题。

## 响应式设计

使用响应式前缀构建移动优先的界面。

## 暗色模式

使用 dark 模式变体支持暗色主题。

## 总结

TailwindCSS 让样式开发更加高效。`,
    excerpt: '分享 TailwindCSS 的实用技巧和最佳实践，帮助开发者更高效地构建 UI。',
    categoryId: 'cat-tech-001',
    tagNames: ['TailwindCSS', '前端开发', 'Web开发'],
    readingTime: 5,
    publishedDaysAgo: 2,
  },
  {
    id: 'post-005',
    title: '我的全栈开发之旅',
    slug: 'my-fullstack-journey',
    content: `# 我的全栈开发之旅

## 开始

三年前，我开始了我的编程之旅。

## 学习路径

### 第一年：基础

- HTML/CSS
- JavaScript
- Git

### 第二年：框架

- React
- Vue
- Node.js

### 第三年：全栈

- Next.js
- PostgreSQL
- Docker

## 经验总结

1. **持续学习** - 技术更新很快
2. **实践项目** - 理论结合实践
3. **社区参与** - 开源贡献

## 未来计划

- 深入学习云原生技术
- 探索 AI 应用开发
- 分享更多技术文章

## 感谢

感谢一路上帮助过我的所有人！`,
    excerpt: '记录我从零开始学习全栈开发的经历和心得，分享学习路线和经验总结。',
    categoryId: 'cat-life-002',
    tagNames: ['全栈开发', 'Web开发'],
    readingTime: 4,
    publishedDaysAgo: 1,
  },
]

async function main() {
  console.log('开始添加测试数据...')

  // 获取或创建用户
  const user = await prisma.user.findFirst()
  if (!user) {
    console.error('数据库中没有用户，请先创建用户')
    return
  }

  console.log(`使用用户: ${user.id}`)

  // 创建分类
  const categories = [
    { id: 'cat-tech-001', name: '技术', slug: 'tech', description: '技术相关文章' },
    { id: 'cat-life-002', name: '生活', slug: 'life', description: '生活记录' },
    { id: 'cat-tutorial-003', name: '教程', slug: 'tutorial', description: '教程文档' },
  ]

  for (const category of categories) {
    await prisma.category.upsert({
      where: { id: category.id },
      update: {},
      create: category,
    })
  }
  console.log('✓ 分类已创建')

  // 创建标签
  const tags = [
    { id: 'tag-001', name: 'React', slug: 'react' },
    { id: 'tag-002', name: 'Next.js', slug: 'nextjs' },
    { id: 'tag-003', name: 'TypeScript', slug: 'typescript' },
    { id: 'tag-004', name: 'TailwindCSS', slug: 'tailwindcss' },
    { id: 'tag-005', name: 'Prisma', slug: 'prisma' },
    { id: 'tag-006', name: '前端开发', slug: 'frontend' },
    { id: 'tag-007', name: '后端开发', slug: 'backend' },
    { id: 'tag-008', name: '全栈开发', slug: 'fullstack' },
    { id: 'tag-009', name: '数据库', slug: 'database' },
    { id: 'tag-010', name: 'Web开发', slug: 'webdev' },
  ]

  for (const tag of tags) {
    await prisma.tag.upsert({
      where: { id: tag.id },
      update: {},
      create: tag,
    })
  }
  console.log('✓ 标签已创建')

  // 创建文章
  for (const postData of posts) {
    const { tagNames, ...postWithoutTags } = postData

    const publishedAt = new Date()
    publishedAt.setDate(publishedAt.getDate() - postWithoutTags.publishedDaysAgo)
    const createdAt = new Date(publishedAt)
    const updatedAt = new Date(publishedAt)

    // 创建或更新文章
    const post = await postWriter.post.upsert({
      where: { id: postData.id },
      update: {
        title: postWithoutTags.title,
        slug: postWithoutTags.slug,
        content: postWithoutTags.content,
        excerpt: postWithoutTags.excerpt,
        categoryId: postWithoutTags.categoryId,
        readingTime: postWithoutTags.readingTime,
        publishedAt,
        updatedAt,
      },
      create: {
        id: postWithoutTags.id,
        title: postWithoutTags.title,
        slug: postWithoutTags.slug,
        content: postWithoutTags.content,
        excerpt: postWithoutTags.excerpt,
        status: 'PUBLISHED',
        locale: 'zh',
        categoryId: postWithoutTags.categoryId,
        authorId: user.id,
        readingTime: postWithoutTags.readingTime,
        publishedAt,
        createdAt,
        updatedAt,
      },
    })

    // 关联标签
    for (const tagName of tagNames) {
      const tag = await prisma.tag.findFirst({
        where: { name: tagName },
      })

      if (tag) {
        await prisma.postTag.upsert({
          where: {
            postId_tagId: {
              postId: post.id,
              tagId: tag.id,
            },
          },
          update: {},
          create: {
            postId: post.id,
            tagId: tag.id,
          },
        })
      }
    }

    // 创建或更新阅读量
    await prisma.viewCount.upsert({
      where: { postId: post.id },
      update: {},
      create: {
        postId: post.id,
        count: Math.floor(Math.random() * 100) + 50, // 随机阅读量 50-150
      },
    })
  }

  console.log('✓ 5篇测试文章已创建')
  console.log('\n数据添加完成！')
}

main()
  .catch((e) => {
    console.error('错误:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
