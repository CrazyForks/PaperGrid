import { PrismaClient } from '@prisma/client'
import { copyFile, mkdir, readFile, unlink, readdir } from 'node:fs/promises'
import { constants } from 'node:fs'
import path from 'node:path'
import { randomUUID, createHash } from 'node:crypto'
import { mediaCopy, rewriteMediaReferences, syncPostMedia } from './media-references.mjs'

const prisma = new PrismaClient()
const root = path.resolve(process.env.MEDIA_ROOT || (process.env.NODE_ENV === 'production' ? '/data/uploads' : '.local/uploads'))
const legacyRoot = path.resolve('public/uploads')
const safePath = (base, relative) => {
 const full = path.resolve(base, relative)
 if (!full.startsWith(base + path.sep)) throw new Error('Media storage path escapes its root')
 return full
}
let moved = 0, isolated = 0, missing = 0
try {
 if (root === legacyRoot) throw new Error('MEDIA_ROOT 必须位于 public 目录之外，请改为 .local/uploads 或数据卷目录')
 let cursor
 do {
  const files = await prisma.mediaFile.findMany({ orderBy:{id:'asc'}, take:100, ...(cursor ? {cursor:{id:cursor},skip:1} : {}) })
  for (const file of files) {
   const from = safePath(legacyRoot,file.storagePath), to = safePath(root,file.storagePath)
   let legacy
   try { legacy = await readFile(from) } catch(error) { if(error.code === 'ENOENT') continue; throw error }
   await mkdir(path.dirname(to),{recursive:true,mode:0o700})
   try { await copyFile(from,to,constants.COPYFILE_EXCL) } catch(error) {
    if(error.code !== 'EEXIST') throw error
    const hash = bytes => createHash('sha256').update(bytes).digest('hex')
    if(hash(legacy) !== hash(await readFile(to))) throw new Error('旧上传目录与新目录有同名且内容不同的文件，已停止自动迁移')
   }
   await unlink(from); moved++
  }
  cursor = files.length === 100 ? files.at(-1).id : undefined
 } while(cursor)
 // Unregistered files must not remain accessible through Next.js static serving.
 // Fail closed and retain them for an explicit backup/migration instead of deleting data.
 const leftovers = await readdir(legacyRoot, { recursive: true, withFileTypes: true })
  .catch(error => { if (error.code === 'ENOENT') return []; throw error })
 if (leftovers.some(entry => !entry.isDirectory())) {
  throw new Error('public/uploads 存在未登记的旧文件，已停止启动；请将遗留文件备份并移出 public/uploads 后重试')
 }
 // One-time URL-aware repair. SQL migrations keep old references until this
 // bounded pass has canonicalized legacy content (including dot segments).
 const referenceVersionKey = 'system.mediaReferencesVersion'
 if (!(await prisma.setting.findUnique({where:{key:referenceVersionKey}}))) {
  let referenceCursor
  do {
   const posts = await prisma.post.findMany({select:{id:true,content:true,coverImage:true,updatedAt:true},orderBy:{id:'asc'},take:100,...(referenceCursor?{cursor:{id:referenceCursor},skip:1}:{})})
   for (const post of posts) {
    const content = rewriteMediaReferences(post.content)
    const cover = rewriteMediaReferences(post.coverImage || '', undefined, 'url')
    await prisma.$transaction(async tx => {
     if (content.text !== post.content || (cover.text || null) !== post.coverImage) {
      await tx.post.update({where:{id:post.id},data:{content:content.text,coverImage:cover.text || null,updatedAt:post.updatedAt}})
     }
     await syncPostMedia(tx,post.id,[...new Set([...content.ids,...cover.ids])])
    })
   }
   referenceCursor = posts.length === 100 ? posts.at(-1).id : undefined
  } while(referenceCursor)
  await prisma.setting.create({data:{key:referenceVersionKey,value:1,group:'system',editable:false}})
 }
 let postCursor
 do {
  const posts = await prisma.post.findMany({ where:{OR:[{isProtected:true},{status:{not:'PUBLISHED'}}]}, select:{id:true,content:true,coverImage:true,updatedAt:true}, orderBy:{id:'asc'},take:100,...(postCursor?{cursor:{id:postCursor},skip:1}:{}) })
  for(const post of posts) {
   const copiedPaths = []
   try {
    const copiedCount = await prisma.$transaction(async tx => {
     const shared = await tx.mediaFile.findMany({where:{AND:[{postReferences:{some:{postId:post.id}}},{postReferences:{some:{post:{status:'PUBLISHED',isProtected:false}}}}]}})
     const replacements = new Map()
     for(const file of shared) {
      const storagePath = `private/${randomUUID()}.${file.ext}`
      const destination = safePath(root,storagePath)
      await mkdir(path.dirname(destination),{recursive:true,mode:0o700})
      try { await copyFile(safePath(root,file.storagePath),destination,constants.COPYFILE_EXCL) }
      catch(error) { if(error.code==='ENOENT') {missing++;continue} throw error }
      copiedPaths.push(destination)
      const clone = await tx.mediaFile.create({data:mediaCopy(file,storagePath,true)})
      replacements.set(file.id,clone.id)
     }
     if (replacements.size) {
      const content = rewriteMediaReferences(post.content,replacements)
      const cover = rewriteMediaReferences(post.coverImage || '',replacements,'url')
      await tx.post.update({where:{id:post.id},data:{content:content.text,coverImage:cover.text || null,updatedAt:post.updatedAt}})
      await syncPostMedia(tx,post.id,[...new Set([...content.ids,...cover.ids])])
      for(const id of replacements.keys()) {
       const privateRefs = await tx.postMedia.count({where:{mediaId:id,post:{OR:[{isProtected:true},{status:{not:'PUBLISHED'}}]}}})
       await tx.mediaFile.update({where:{id},data:{private:privateRefs>0}})
      }
     }
     return replacements.size
    }, {timeout:30000})
    isolated += copiedCount
   } catch(error) {
    await Promise.all(copiedPaths.map(file => unlink(file).catch(() => {})))
    throw error
   }
  }
  postCursor = posts.length===100 ? posts.at(-1).id : undefined
 } while(postCursor)
 if(moved||isolated||missing) console.log(`[media:upgrade] moved=${moved} isolated=${isolated} missing=${missing}`)
} finally { await prisma.$disconnect() }
