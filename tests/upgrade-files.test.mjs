import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, readdir, access, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { DatabaseSync } from 'node:sqlite'
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { bootstrapAdmin } from '../scripts/bootstrap-admin.mjs'

const execute = promisify(execFile)
test('legacy files move privately, shared URLs separate, and default credentials rotate', async () => {
 const root = process.cwd()
 const dir = await mkdtemp(path.join(tmpdir(),'papergrid-upgrade-'))
 const dbPath = path.join(dir,'upgrade.sqlite')
 const sqlite = new DatabaseSync(dbPath)
 for(const migration of (await readdir('prisma/migrations')).filter(n=>/^\d/.test(n)).sort()) sqlite.exec(await readFile(`prisma/migrations/${migration}/migration.sql`,'utf8'))
 sqlite.close()
 const prisma = new PrismaClient({datasources:{db:{url:`file:${dbPath}`}}})
 const previousDir = process.env.DATA_DIR
 process.env.DATA_DIR = dir
 try {
  const admin = await prisma.user.create({data:{email:'legacy@papergrid.invalid',role:'ADMIN',password:await bcrypt.hash('admin123',10)}})
  await bootstrapAdmin(prisma)
  const rotated = await prisma.user.findUnique({where:{id:admin.id}})
  assert.ok(!await bcrypt.compare('admin123',rotated.password))
  await bootstrapAdmin(prisma)
  assert.equal((await prisma.user.findUnique({where:{id:admin.id}})).password,rotated.password)
  const media=await prisma.mediaFile.create({data:{id:'legacy-image',originalName:'legacy.png',storagePath:'old/legacy.png',mimeType:'image/png',ext:'png',size:11}})
  const content=`/api/files/${media.id}\n\n# 图片说明\n测试正文`
  const publicPost=await prisma.post.create({data:{title:'Public',slug:'public',content,coverImage:`/api/fi\tles/\n${media.id}`,status:'PUBLISHED',authorId:admin.id}})
  const secretPost=await prisma.post.create({data:{title:'Secret',slug:'secret',content:content.replace('/api/files/', '/api/files/./'),status:'PUBLISHED',authorId:admin.id,isProtected:true,passwordHash:'retained'}})
  await mkdir(path.join(dir,'public/uploads/old'),{recursive:true})
  await writeFile(path.join(dir,'public/uploads/old/legacy.png'),'image-bytes')
  await execute(process.execPath,[path.join(root,'scripts/upgrade-media.mjs')],{cwd:dir,env:{...process.env,DATABASE_URL:`file:${dbPath}`,MEDIA_ROOT:path.join(dir,'private-uploads')}})
  const savedPublic=await prisma.post.findUnique({where:{id:publicPost.id}})
  const savedSecret=await prisma.post.findUnique({where:{id:secretPost.id}})
  assert.equal(savedPublic.content,content)
  assert.equal(savedPublic.coverImage,`/api/files/${media.id}`)
  assert.notEqual(savedSecret.content,content)
  assert.ok(savedSecret.content.endsWith('\n\n# 图片说明\n测试正文'))
  assert.equal(savedSecret.passwordHash,'retained')
  assert.equal((await prisma.mediaFile.findUnique({where:{id:media.id}})).private,false)
  assert.equal((await prisma.mediaFile.findFirst({where:{id:{not:media.id}}})).private,true)
  assert.equal(await prisma.postMedia.count(),2)
  assert.ok(await prisma.setting.findUnique({where:{key:'system.mediaReferencesVersion'}}))
  const fileCount = await prisma.mediaFile.count()
  await execute(process.execPath,[path.join(root,'scripts/upgrade-media.mjs')],{cwd:dir,env:{...process.env,DATABASE_URL:`file:${dbPath}`,MEDIA_ROOT:path.join(dir,'private-uploads')}})
  assert.equal(await prisma.mediaFile.count(),fileCount)
  assert.equal((await prisma.post.findUnique({where:{id:secretPost.id}})).updatedAt.getTime(),secretPost.updatedAt.getTime())
  await assert.rejects(access(path.join(dir,'public/uploads/old/legacy.png')))
  assert.equal(await readFile(path.join(dir,'private-uploads/old/legacy.png'),'utf8'),'image-bytes')
  await writeFile(path.join(dir,'public/uploads/old/unregistered.txt'),'private legacy marker')
  await assert.rejects(execute(process.execPath,[path.join(root,'scripts/upgrade-media.mjs')],{cwd:dir,env:{...process.env,DATABASE_URL:`file:${dbPath}`,MEDIA_ROOT:path.join(dir,'private-uploads')}}), error => {
    assert.match(error.stderr, /未登记的旧文件/)
    return true
  })
  assert.equal(await readFile(path.join(dir,'public/uploads/old/unregistered.txt'),'utf8'),'private legacy marker')
  assert.equal(await readFile(path.join(dir,'private-uploads/old/legacy.png'),'utf8'),'image-bytes')
 } finally {
  if(previousDir===undefined)delete process.env.DATA_DIR;else process.env.DATA_DIR=previousDir
  await prisma.$disconnect();await rm(dir,{recursive:true,force:true})
 }
})
