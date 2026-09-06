import { prisma, postWriter } from '../src/lib/prisma'

const fullMarkdownPost = {
  id: 'post-markdown-guide',
  title: 'Markdown 完全语法指南',
  slug: 'markdown-complete-guide',
  content: `# Markdown 完全语法指南

这是一篇包含所有 Markdown 语法的测试文章,用于展示博客系统的 Markdown 渲染能力。

## 1. 标题 (Headings)

Markdown 支持6级标题:

\`\`\`
# 一级标题
## 二级标题
### 三级标题
#### 四级标题
##### 五级标题
###### 六级标题
\`\`\`

## 2. 文本样式

### 粗体和斜体

- **粗体文本**: 使用 \`**文本**\`
- *斜体文本*: 使用 \`*文本*\`
- ***粗斜体文本***: 使用 \`***文本***\`
- ~~删除线文本~~: 使用 \`~~文本~~\`

### 混合使用

你可以**粗体和*斜体*混合**使用。

## 3. 段落和换行

这是一个段落。

这是另一个段落。段落之间用空行分隔。

想在段落内换行?
在行尾添加两个空格即可。
或者使用 HTML 的 \`<br>\` 标签。

## 4. 引用 (Blockquotes

这是一个引用:

> 这是一段引用文本。
>
> 引用可以跨越多行。
>
> > 甚至可以嵌套引用。
> > 这是嵌套的内容。

## 5. 列表 (Lists)

### 无序列表

- 第一项
- 第二项
  - 嵌套项 1
  - 嵌套项 2
- 第三项

### 有序列表

1. 第一项
2. 第二项
   1. 嵌套编号项 1
   2. 嵌套编号项 2
3. 第三项

### 任务列表

- [x] 已完成的任务
- [ ] 未完成的任务
- [ ] 另一个待办事项

## 6. 代码 (Code

### 行内代码

使用 \`\\\`代码\\\`\` 创建行内代码,例如 \`const x = 1\`。

### 代码块

使用三个反引号创建代码块:

\`\`\`javascript
function greet(name) {
  console.log(\`Hello, \${name}!\`);
  return \`Welcome, \${name}\`;
}

// 调用函数
greet('World');
\`\`\`

### 带语法的代码块

\`\`\`typescript
interface User {
  id: number;
  name: string;
  email: string;
}

const user: User = {
  id: 1,
  name: '张三',
  email: 'zhangsan@example.com'
};
\`\`\`

\`\`\`python
def fibonacci(n):
    if n <= 1:
        return n
    return fibonacci(n-1) + fibonacci(n-2)

print(fibonacci(10))
\`\`\`

\`\`\`bash
# 安装依赖
pnpm install

# 运行开发服务器
pnpm dev

# 构建生产版本
pnpm build
\`\`\`

## 7. 链接 (Links)

### 普通链接

[GitHub](https://github.com)

[Next.js 官方文档](https://nextjs.org/docs)

### 带标题的链接

[这是一个带标题的链接](https://example.com "鼠标悬停显示此标题")

### 自动链接

<https://github.com>
<mailto:user@example.com>

## 8. 图片 (Images

### 普通图片

![替代文本](https://picsum.photos/800/400)

### 带标题的图片

![风景图片](https://picsum.photos/600/400 "这是图片标题")

### 指定大小的图片

<https://picsum.photos/200/200>

## 9. 表格 (Tables

| 列1 | 列2 | 列3 |
|-----|-----|-----|
| 内容1 | 内容2 | 内容3 |
| 内容4 | 内容5 | 内容6 |

### 对齐方式

| 左对齐 | 居中 | 右对齐 |
|:-------|:----:|-------:|
| Left   | Center | Right |
| L      | C      | R      |

### 复杂表格

| 功能 | 支持 | 说明 |
|------|------|------|
| 粗体 | ✅ | \`**text**\` |
| 斜体 | ✅ | \`*text*\` |
| 链接 | ✅ | \`[text](url)\` |
| 图片 | ✅ | \`![alt](url)\` |
| 代码 | ✅ | \\\`code\\\` |

## 10. 水平线 (Horizontal Rules

以下是三种创建水平线的方式:

***

---

___


## 11. 转义字符 (Escaping

使用反斜杠 \\\`\\\` 转义特殊字符:

\\* 不是斜体 \\
\\** 不是粗体 \\**

## 12. HTML 支持

Markdown 支持嵌入 HTML:

<div style="color: blue; background: #f0f0f0; padding: 10px; border-radius: 5px;">
  这是一个使用 HTML 样式的 div 元素。
</div>

<details>
  <summary>点击展开折叠内容</summary>

  这是隐藏的内容,可以包含任何 Markdown。

  > 甚至可以在内部使用引用!
</details>

## 13. 数学公式 (使用 HTML

行内公式: E = mc²

块级公式:

$$
\\frac{n!}{k!(n-k)!} = \\binom{n}{k}
$$

## 14. 脚注 (Footnotes

这是一个脚注引用[^1]。

这是另一个脚注[^2]。

[^1]: 这是第一个脚注的内容。
[^2]: 这是第二个脚注的内容,可以包含**格式化文本**。

## 15. 高亮文本

==这是高亮文本== (需要特定支持)

## 16. 下标和上标

H~2~O 和 X^n^

## 17. 表情符号 (Emoji

使用原生 emoji: 😊 🎉 ❤️ ⭐

或者使用简码: :smile: :heart: :star:

一些常用表情:
- 😄 笑脸
- ❤️ 爱心
- ⭐ 星星
- 🔥 火焰
- ✅ 勾选
- ❌ 叉号

## 18. 缩写定义

*[HTML]: HyperText Markup Language
*[CSS]: Cascading Style Sheets
*[JS]: JavaScript

HTML 和 CSS 是 Web 开发的基础。

## 19. 定义列表

<dl>
  <dt>术语1</dt>
  <dd>定义1</dd>
  <dt>术语2</dt>
  <dd>定义2</dd>
</dl>

## 20. 分割线和分隔

---

### 不同部分

以上部分继续...

---

**总结**

Markdown 是一种轻量级标记语言,让你可以使用易读易写的纯文本格式编写文档。它的优点包括:

1. ✅ 易读易写
2. ✅ 兼容 HTML
3. ✅ 支持代码高亮
4. ✅ 丰富的扩展语法

---

感谢阅读! 🎉

如有问题,请访问 [GitHub](https://github.com) 查看更多信息。`,
  excerpt: '这是一篇包含所有 Markdown 语法的完整指南,涵盖标题、文本样式、列表、代码、链接、图片、表格等所有常用语法。',
  categoryId: 'cat-tutorial-003',
  tagNames: ['Markdown', '教程', 'Web开发'],
  readingTime: 15,
  publishedDaysAgo: 0,
}

async function main() {
  console.log('开始添加 Markdown 完整指南...')

  // 获取用户
  const user = await prisma.user.findFirst()
  if (!user) {
    console.error('数据库中没有用户')
    return
  }

  console.log(`使用用户: ${user.id}`)

  // 创建文章
  const { tagNames, ...postData } = fullMarkdownPost
  const now = new Date()

  const post = await postWriter.post.upsert({
    where: { id: postData.id },
    update: {
      title: postData.title,
      slug: postData.slug,
      content: postData.content,
      excerpt: postData.excerpt,
      categoryId: postData.categoryId,
      readingTime: postData.readingTime,
      updatedAt: now,
    },
    create: {
      id: postData.id,
      title: postData.title,
      slug: postData.slug,
      content: postData.content,
      excerpt: postData.excerpt,
      status: 'PUBLISHED',
      locale: 'zh',
      categoryId: postData.categoryId,
      authorId: user.id,
      readingTime: postData.readingTime,
      publishedAt: now,
      createdAt: now,
      updatedAt: now,
    },
  })

  console.log('✓ 文章已创建')

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

  console.log('✓ 标签已关联')

  // 创建阅读量
  await prisma.viewCount.upsert({
    where: { postId: post.id },
    update: {},
    create: {
      postId: post.id,
      count: 200,
    },
  })

  console.log('✓ 阅读量已设置')
  console.log('\n✅ Markdown 完整指南已添加!')
  console.log(`文章标题: ${postData.title}`)
  console.log(`文章ID: ${postData.id}`)
}

main()
  .catch((e) => {
    console.error('错误:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
