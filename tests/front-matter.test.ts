import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildYamlFrontMatter, parseFrontMatter } from '../src/lib/import-export/front-matter'

test('Markdown metadata preserves escapes, protection and exact dates across timezones', () => {
  const previousTz = process.env.TZ
  const input = {
    title: '关于 "Hello" 和 C:\\temp\n第二行',
    slug: 'round-trip',
    tags: ['a,b', '带 "引号"', 'C:\\temp'],
    categories: ['分类: 测试'],
    date: new Date('2026-09-05T12:00:00.123Z'),
    updated: new Date('2026-09-06T01:02:03.456Z'),
    published: true,
    isProtected: true,
  }
  try {
    for (const timezone of ['Asia/Shanghai', 'America/New_York', 'UTC']) {
      process.env.TZ = timezone
      const parsed = parseFrontMatter(buildYamlFrontMatter(input) + '\n正文')
      assert.deepEqual(parsed.fields, input)
      assert.equal(parsed.body.trim(), '正文')
    }
  } finally {
    if (previousTz === undefined) delete process.env.TZ
    else process.env.TZ = previousTz
  }
})

test('Hexo YAML keeps aliases, lists, quoted commas and comments', () => {
  const parsed = parseFrontMatter(`---
title: 'It''s a post' # comment
date: 2026-09-05 12:00:00 +0800
lastmod: 2026-09-06T04:00:00Z
tag: ["a,b", 'quoted tag']
category: notes
draft: true
---
body`)
  assert.equal(parsed.fields.title, "It's a post")
  assert.equal(parsed.fields.date?.toISOString(), '2026-09-05T04:00:00.000Z')
  assert.deepEqual(parsed.fields.tags, ['a,b', 'quoted tag'])
  assert.deepEqual(parsed.fields.categories, ['notes'])
  assert.equal(parsed.fields.published, false)
})

test('Hugo TOML supports multiline arrays and nested tables without overriding root fields', () => {
  const parsed = parseFrontMatter(`+++
title = "A \\"quoted\\" title"
date = 2026-09-05T12:00:00+08:00
tags = [
  "a,b", # comment
  'C:\\temp',
]
categories = ["notes"]
draft = false
[params]
title = "nested title"
+++
body`)
  assert.equal(parsed.fields.title, 'A "quoted" title')
  assert.equal(parsed.fields.date?.getTime(), new Date('2026-09-05T04:00:00Z').getTime())
  assert.deepEqual(parsed.fields.tags, ['a,b', 'C:\\temp'])
  assert.equal(parsed.fields.published, true)
})

test('JSON and legacy JSON-like front matter remain compatible', () => {
  for (const markdown of [
    ';;;\n{"title":"Hello", "tags":["a,b"], "published":false}\n;;;\nbody',
    '"title": "Hello",\n"tags": ["a,b"],\n"published": false\n;;;\nbody',
    ';;;\ntitle: "Hello",\ntags: ["a,b"],\npublished: false,\n;;;\nbody',
  ]) {
    const parsed = parseFrontMatter(markdown)
    assert.equal(parsed.fields.title, 'Hello')
    assert.deepEqual(parsed.fields.tags, ['a,b'])
    assert.equal(parsed.fields.published, false)
    assert.equal(parsed.body, 'body')
  }
})

test('ambiguous duplicate YAML protection flags are rejected', () => {
  assert.throws(() => parseFrontMatter('---\nisProtected: true\nisProtected: false\n---\nsecret'))
})
