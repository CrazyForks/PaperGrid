import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, mkdir, cp, readdir, writeFile, chmod, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import { createServer } from 'node:net'

const execute = promisify(execFile)
const image = process.env.IMAGE || process.argv[2] || 'papergrid-local:latest'
const root = path.resolve(import.meta.dirname, '..')
const dir = await mkdtemp(path.join(tmpdir(), 'papergrid-image-startup-'))
const prefix = `papergrid-startup-${randomBytes(6).toString('hex')}`
const containers = new Set()
const volumes = new Set()
const abort = new AbortController()
process.once('SIGINT', () => abort.abort())
process.once('SIGTERM', () => abort.abort())
const docker = async args => (await execute('docker', args, { timeout: 120000, maxBuffer: 1024 * 1024, signal: abort.signal })).stdout.trim()

async function freePort() {
  const server = createServer()
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
  const port = server.address().port
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  return port
}

async function waitForApp(base, name) {
  const deadline = Date.now() + 90000
  while (Date.now() < deadline) {
    abort.signal.throwIfAborted()
    try {
      const response = await fetch(base + '/api/auth/csrf', { signal: AbortSignal.timeout(1500) })
      if (response.ok) return
    } catch { /* Container may still be migrating. */ }
    assert.equal(await docker(['inspect', '--format', '{{.State.Running}}', name]), 'true', 'container exited before serving requests')
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  throw new Error('container did not become ready within 90 seconds')
}

async function checkHttp(base, email, password) {
  assert.equal((await fetch(base)).status, 200)
  const jar = new Map()
  const save = response => {
    for (const cookie of response.headers.getSetCookie()) {
      const [key, ...value] = cookie.split(';')[0].split('=')
      jar.set(key, value.join('='))
    }
  }
  const cookies = () => [...jar].map(([key, value]) => `${key}=${value}`).join('; ')
  const csrf = await fetch(base + '/api/auth/csrf')
  save(csrf)
  const { csrfToken } = await csrf.json()
  const login = await fetch(base + '/api/auth/callback/credentials', {
    method: 'POST', redirect: 'manual',
    headers: { Cookie: cookies(), Origin: base, 'Content-Type': 'application/x-www-form-urlencoded', 'X-Auth-Return-Redirect': '1' },
    body: new URLSearchParams({ csrfToken, email, password, callbackUrl: base + '/admin', json: 'true' }),
  })
  save(login)
  const session = await fetch(base + '/api/auth/session', { headers: { Cookie: cookies() } })
  assert.equal((await session.json()).user?.role, 'ADMIN', 'administrator must be able to sign in')
  assert.equal((await fetch(base + '/api/admin/posts', { headers: { Cookie: cookies() } })).status, 200)
}

try {
  const fixture = path.join(dir, 'fixture')
  const legacyPrisma = path.join(fixture, 'prisma')
  await mkdir(path.join(legacyPrisma, 'migrations'), { recursive: true })
  await cp(path.join(root, 'prisma/schema.prisma'), path.join(legacyPrisma, 'schema.prisma'))
  for (const name of await readdir(path.join(root, 'prisma/migrations'))) {
    if (name === 'migration_lock.toml' || (/^\d/.test(name) && name < '20260905000000')) {
      await cp(path.join(root, 'prisma/migrations', name), path.join(legacyPrisma, 'migrations', name), { recursive: true })
    }
  }
  await cp(path.join(root, 'tests/helpers/image-startup-fixture.mjs'), path.join(fixture, 'fixture.mjs'))
  // The image runs as UID 1001 and needs read-only access to synthetic fixtures.
  await chmod(dir, 0o755)
  const mountFixture = ['--mount', `type=bind,source=${fixture},target=/fixture,readonly`,
    '--mount', `type=bind,source=${fixture}/fixture.mjs,target=/app/scripts/startup-test.mjs,readonly`]
  for (const mode of ['fresh', 'upgrade']) {
    const name = `${prefix}-${mode}`
    const volume = `${name}-data`
    volumes.add(volume)
    await docker(['volume', 'create', '--label', 'papergrid.test=image-startup', volume])
    const port = await freePort()
    const base = `http://127.0.0.1:${port}`
    const initialPassword = randomBytes(24).toString('base64url')
    const legacyPassword = randomBytes(24).toString('base64url')
    const envFile = path.join(dir, `${mode}.env`)
    await writeFile(envFile, `DATABASE_URL=file:/data/db.sqlite\nNEXTAUTH_URL=${base}\nAUTH_TRUST_HOST=true\nMEDIA_ROOT=/data/uploads\nADMIN_INIT_PASSWORD=${initialPassword}\nTEST_UPGRADE_PASSWORD=${legacyPassword}\n`, { mode: 0o600 })
    const mounted = ['--env-file', envFile, '--mount', `type=volume,source=${volume},target=/data`, ...mountFixture]
    const oneShot = async args => {
      const task = `${name}-fixture`
      containers.add(task)
      await docker(['run', '--rm', '--name', task, ...mounted, '--entrypoint', 'node', image, ...args])
      containers.delete(task)
    }
    if (mode === 'upgrade') {
      await oneShot(['/app/prisma-cli/node_modules/prisma/build/index.js', 'migrate', 'deploy', '--schema=/fixture/prisma/schema.prisma'])
      await oneShot(['/app/scripts/startup-test.mjs', 'seed-legacy'])
    }
    containers.add(name)
    await docker(['run', '--detach', '--name', name, '--label', 'papergrid.test=image-startup', ...mounted, '-p', `127.0.0.1:${port}:3000`, image])
    await waitForApp(base, name)
    await checkHttp(base, mode === 'fresh' ? 'admin@example.com' : 'upgrade@example.invalid', mode === 'fresh' ? initialPassword : legacyPassword)
    await docker(['exec', name, 'node', '/app/scripts/startup-test.mjs', `verify-${mode}`])
    if (mode === 'upgrade') {
      assert.equal(await (await fetch(base + '/api/files/upgrade-media')).text(), 'image-startup-upload-fixture')
      const secret = await docker(['exec', name, 'node', '-e', "process.stdout.write(require('fs').readFileSync('/data/nextauth_secret','utf8'))"])
      await docker(['restart', name])
      await waitForApp(base, name)
      await checkHttp(base, 'upgrade@example.invalid', legacyPassword)
      assert.equal(await docker(['exec', name, 'node', '-e', "process.stdout.write(require('fs').readFileSync('/data/nextauth_secret','utf8'))"]), secret)
      await docker(['exec', name, 'node', '/app/scripts/startup-test.mjs', 'verify-upgrade'])
    }
    console.log(`PASS: image ${mode} startup, migrations, administrator login and persisted data`)
  }
} catch (error) {
  for (const name of containers) {
    const logs = await execute('docker', ['logs', '--tail', '60', name]).catch(() => null)
    if (logs) console.error(logs.stdout, logs.stderr)
  }
  throw error
} finally {
  for (const name of containers) await execute('docker', ['rm', '-f', name]).catch(() => {})
  for (const volume of volumes) await execute('docker', ['volume', 'rm', volume])
  await rm(dir, { recursive: true, force: true })
}
