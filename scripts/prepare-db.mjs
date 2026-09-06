import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomBytes } from 'node:crypto'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

process.chdir(root)

if (process.env.SKIP_DB_PREPARE === '1') {
  console.log('[db:prepare] SKIP_DB_PREPARE=1, skipping.')
  process.exit(0)
}

const envPath = resolve(root, '.env')
const envExamplePath = resolve(root, '.env.example')

if (!existsSync(envPath) && existsSync(envExamplePath)) {
  const example = readFileSync(envExamplePath, 'utf8').replace('your-secret-key-change-this-in-production', randomBytes(32).toString('hex'))
  writeFileSync(envPath, example, { mode: 0o600 })
  console.log('[db:prepare] .env not found, copied from .env.example.')
}

const envContent = existsSync(envPath) ? readFileSync(envPath, 'utf8') : ''
const match = envContent.match(/^\s*DATABASE_URL\s*=\s*['"]?([^'"\n]+)['"]?/m)
const databaseUrl = process.env.DATABASE_URL || match?.[1]?.trim()

if (!databaseUrl) {
  console.log('[db:prepare] DATABASE_URL not set, skipping.')
  process.exit(0)
}

process.env.CHECKPOINT_DISABLE = '1'
const run = (...args) => execFileSync(process.execPath, args, { stdio: 'inherit' })

try {
  run('node_modules/prisma/build/index.js', 'generate')
  run('node_modules/prisma/build/index.js', 'migrate', 'deploy')
  run('--env-file-if-exists=.env', 'scripts/upgrade-media.mjs')
  if (process.env.SKIP_DB_SEED !== '1') {
    run('--env-file-if-exists=.env', '--import', 'tsx', 'prisma/seed.ts')
    run('--env-file-if-exists=.env', 'scripts/bootstrap-admin.mjs')
  } else {
    console.log('[db:prepare] SKIP_DB_SEED=1, skip seeding.')
  }
} catch (error) {
  console.error('[db:prepare] Failed to prepare database.')
  process.exit(1)
}
