import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, access, rm, symlink, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

test('standalone packaging preserves bootstrap dependencies and hero assets but excludes runtime uploads', async () => {
  const script = path.resolve('scripts/prepare-standalone.mjs')
  const dir = await mkdtemp(path.join(tmpdir(), 'papergrid-standalone-assets-'))
  const assets = ['arona-touch-eyes.webp', 'arona-expressions.webp', 'blue-archive/arona-loading.webp',
    'blue-archive/loading-desktop.webp', 'blue-archive/loading-mobile.webp', 'blue-archive/triangle-grid.webp']
  try {
    await mkdir(path.join(dir, 'node_modules'), { recursive: true })
    await symlink(await realpath('node_modules/bcryptjs'), path.join(dir, 'node_modules/bcryptjs'), 'dir')
    for (const asset of assets) {
      const file = path.join(dir, 'public/assets', asset)
      await mkdir(path.dirname(file), { recursive: true })
      await writeFile(file, asset)
    }
    for (const file of ['public/uploads/secret.txt', '.next/standalone/public/uploads/stale.txt', '.next/static/chunk.js']) {
      await mkdir(path.dirname(path.join(dir, file)), { recursive: true })
      await writeFile(path.join(dir, file), 'synthetic fixture')
    }
    await promisify(execFile)(process.execPath, [script], { cwd: dir })
    await rm(path.join(dir, 'node_modules'), { recursive: true })
    await promisify(execFile)(process.execPath, ['--input-type=module', '-e',
      "import assert from 'node:assert/strict'; import bcrypt from 'bcryptjs'; assert.ok(await bcrypt.compare('fixture-password', await bcrypt.hash('fixture-password', 4)))"],
    { cwd: path.join(dir, '.next/standalone') })
    await assert.rejects(access(path.join(dir, '.next/standalone/public/uploads')), { code: 'ENOENT' })
    assert.equal(await readFile(path.join(dir, 'public/uploads/secret.txt'), 'utf8'), 'synthetic fixture')
    for (const asset of assets) {
      assert.equal(await readFile(path.join(dir, '.next/standalone/public/assets', asset), 'utf8'), asset)
    }
    await access(path.join(dir, '.next/standalone/.next/static/chunk.js'))
  } finally { await rm(dir, { recursive: true, force: true }) }
})
