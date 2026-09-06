import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Prisma } from '@prisma/client'
import { createPostWithSlug, generatePostSlug } from '../src/lib/post-slug'
import { generateTaxonomySlug, isValidSlug, taxonomyNameChange } from '../src/lib/slug'
import { validateTaxonomyInput } from '../src/lib/taxonomy-input'
import { resolveImportSlug, assertDistinctImportSlugs } from '../src/lib/import-export/slug'

test('article IDs are URL-safe and independent of repeated titles', async () => {
  const values = Array.from({ length: 100 }, generatePostSlug)
  assert.equal(new Set(values).size, values.length)
  for (const value of values) assert.match(value, /^[A-Za-z0-9_-]{16}$/)
  const conflict = new Prisma.PrismaClientKnownRequestError('collision', {
    code: 'P2002', clientVersion: 'test', meta: { target: ['slug'] },
  })
  let attempts = 0
  const candidates = ['existing', 'new-value']
  const saved = await createPostWithSlug(async slug => {
    attempts++
    if (slug === 'existing') throw conflict
    return slug
  }, () => candidates.shift()!)
  assert.equal(saved, 'new-value')
  assert.equal(attempts, 2)
  attempts = 0
  await assert.rejects(createPostWithSlug(async () => { attempts++; throw conflict }), error => error === conflict)
  assert.equal(attempts, 5, 'persistent conflicts have a bounded retry budget')
  attempts = 0
  const otherConflict = new Prisma.PrismaClientKnownRequestError('other', {
    code: 'P2002', clientVersion: 'test', meta: { target: ['id'] },
  })
  await assert.rejects(createPostWithSlug(async () => { attempts++; throw otherConflict }), error => error === otherConflict)
  assert.equal(attempts, 1, 'unrelated failures must not be retried')
})

test('taxonomy names keep generating until slug is manually edited', () => {
  let form = { name: '', slug: '', description: 'unchanged' }
  for (const name of ['r', 're', 'rea', 'reac', 'react']) form = taxonomyNameChange(form, name, false)
  assert.equal(form.slug, 'react')
  form = taxonomyNameChange({ ...form, slug: 'custom-url' }, 'React 中文', true)
  assert.equal(form.slug, 'custom-url')
  assert.equal(form.description, 'unchanged')
  assert.equal(generateTaxonomySlug(' 中文 技术 '), '中文-技术')
  assert.equal(generateTaxonomySlug('ＣＳＳ & React'), 'css-react')
})

test('taxonomy writes reject broken routes on both create and patch', () => {
  for (const slug of ['', ' ', '../a', 'a/b', 'a\\b', 'a?x', 'a#x', '%2F', 'a'.repeat(201), null, 1]) {
    assert.equal(isValidSlug(slug), false)
    for (const partial of [false, true]) assert.throws(() => validateTaxonomyInput({ name: '名称', slug }, partial))
  }
  for (const slug of ['中文-技术', 'react', 'Cafe-Notes', 'abc_DEF-123']) {
    validateTaxonomyInput({ name: '名称', slug })
  }
  validateTaxonomyInput({ name: '修改名称' }, true)
  assert.throws(() => validateTaxonomyInput({ name: ' ' }, true))
})

test('import identity preserves Chinese and random IDs and rejects duplicates before writing', () => {
  for (const slug of ['入门-react', '进阶-react', 'Abc_123456789-Zxy']) {
    assert.equal(resolveImportSlug(slug, 'irrelevant.md'), slug)
  }
  assert.equal(resolveImportSlug(undefined, '中文手记.md'), '中文手记')
  const first = resolveImportSlug(undefined, 'notes/✨.md')
  assert.equal(resolveImportSlug(undefined, 'notes/✨.md'), first)
  assert.notEqual(resolveImportSlug(undefined, 'other/✨.md'), first)
  assert.notEqual(resolveImportSlug(undefined, 'first/index.md'), resolveImportSlug(undefined, 'second/index.md'))
  assert.throws(() => resolveImportSlug('a/b', 'safe.md'))
  assertDistinctImportSlugs([{ slug: '入门-react', originFile: 'a.md' }, { slug: '进阶-react', originFile: 'b.md' }])
  assert.throws(() => assertDistinctImportSlugs([{ slug: 'same', originFile: 'a.md' }, { slug: 'same', originFile: 'b.md' }]), /本批次尚未写入/)
})
