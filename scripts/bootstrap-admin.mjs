import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { randomBytes } from 'node:crypto'
import { writeFile, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'

export async function bootstrapAdmin(prisma) {
  const existing = await prisma.user.findFirst({ where: { role: 'ADMIN' } })
  const insecure = existing?.password && await bcrypt.compare('admin123', existing.password)
  if (existing && !insecure) return
  if (process.env.SKIP_ADMIN_BOOTSTRAP === '1') return
  const configured = process.env.ADMIN_INIT_PASSWORD
  if (configured && (configured.length < 12 || Buffer.byteLength(configured) > 72 || configured === 'admin123')) {
    throw new Error('ADMIN_INIT_PASSWORD must contain 12–72 bytes')
  }
  const password = configured || randomBytes(24).toString('base64url')
  const email = existing?.email || process.env.ADMIN_INIT_EMAIL || 'admin@example.com'
  const hash = await bcrypt.hash(password, 12)
  if (!configured) {
    const directory = process.env.DATA_DIR || resolve('.local')
    await mkdir(directory, { recursive: true, mode: 0o700 })
    const file = resolve(directory, 'initial-admin.txt')
    await writeFile(file, `Email: ${email}\nPassword: ${password}\n`, { mode: 0o600 })
    console.log(`[bootstrap] Initial credentials saved to ${file}; change password after signing in.`)
  }
  if (existing) await prisma.user.update({ where: { id: existing.id }, data: { password: hash } })
  else await prisma.user.create({ data: { email, password: hash, name: 'Admin', role: 'ADMIN' } })
}

if (process.argv[1] && import.meta.url === new URL(`file://${resolve(process.argv[1])}`).href) {
  const prisma = new PrismaClient()
  try { await bootstrapAdmin(prisma) }
  finally { await prisma.$disconnect() }
}
