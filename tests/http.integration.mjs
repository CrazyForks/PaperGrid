// Runs against an isolated copy of the development database and a production build.
// Explicit invocation: node --env-file=.env tests/http.integration.mjs
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, copyFile, readFile, writeFile, mkdir, cp } from 'node:fs/promises'
import path from 'node:path'
import { randomBytes, createHash } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import sharp from 'sharp'
import { runPluginApiRegression } from './helpers/plugin-api-regression.mjs'

const root = process.cwd()
await mkdir(path.join(root, '.local'), { recursive: true })
const dir = await mkdtemp(path.join(root, '.local/http-integration-'))
await copyFile(process.env.DATABASE_URL.replace(/^file:/, ''), path.join(dir, 'test.sqlite'))
const dbUrl = `file:${dir}/test.sqlite`
const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } })
const email = 'integration@papergrid.invalid'
const password = randomBytes(24).toString('base64url')
const user = await prisma.user.upsert({ where: { email }, create: { email, name: '测试管理员', role: 'ADMIN', password: await bcrypt.hash(password, 10) }, update: { role: 'ADMIN', password: await bcrypt.hash(password, 10) } })
const port = 3092
const base = `http://127.0.0.1:${port}`
await cp('public', '.next/standalone/public', { recursive: true, filter: source => path.resolve(source) !== path.resolve('public/uploads') })
await cp('.next/static', '.next/standalone/.next/static', { recursive: true })
const child = spawn(process.execPath, ['.next/standalone/server.js'], {
  env: { ...process.env, PORT: String(port), HOSTNAME: '127.0.0.1', DATABASE_URL: dbUrl, DATA_DIR: dir, MEDIA_ROOT: path.join(dir, 'uploads'), NEXTAUTH_URL: base, NEXT_PUBLIC_SITE_URL: base, AUTH_TRUST_HOST: 'true', NODE_OPTIONS: `--max-old-space-size=160 --max-semi-space-size=2 --require=${root}/tests/memory-probe.cjs`, PAPERGRID_METRICS_PATH: path.join(dir, 'metrics.json'), MALLOC_ARENA_MAX: '2', NEXT_TELEMETRY_DISABLED: '1' },
  stdio: ['ignore', 'pipe', 'pipe'],
})
let serverLog = ''
child.stdout.on('data', b => { serverLog = (serverLog + b).slice(-200000) })
child.stderr.on('data', b => { serverLog = (serverLog + b).slice(-200000) })
let count = 0
const jar = new Map()
const visitor = new Map()
const saveCookies = (res, target) => { for(const cookie of res.headers.getSetCookie()) { const [name, ...value] = cookie.split(';')[0].split('='); target.set(name, value.join('=')) } }
async function req(route, { method = 'GET', data, form, cookies = jar, headers = {}, expected = 200 } = {}) {
 const res = await fetch(base + route, { method, redirect: 'manual', headers: { ...(cookies?.size ? { Cookie: [...cookies].map(([k,v]) => `${k}=${v}`).join('; ') } : {}), ...(data !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers }, body: form || (data !== undefined ? JSON.stringify(data) : undefined) })
 if(cookies) saveCookies(res, cookies)
 const content = await res.text()
 assert.ok([expected].flat().includes(res.status), `${method} ${route} => ${res.status}, expected ${expected}: ${content.slice(0, 160)}`)
 count++
 return { res, text: content, data: res.headers.get('content-type')?.includes('application/json') ? JSON.parse(content) : undefined }
}
async function login(loginPassword = password, loginEmail = email) {
 const csrf = await req('/api/auth/csrf')
 const body = new URLSearchParams({ csrfToken: csrf.data.csrfToken, email: loginEmail, password: loginPassword, callbackUrl: base + '/admin', json: 'true' })
 await req('/api/auth/callback/credentials', { method: 'POST', form: body, headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Auth-Return-Redirect': '1', Origin: base } })
 const session = await req('/api/auth/session')
 assert.equal(session.data.user?.role, 'ADMIN', 'credentials session must be authenticated')
}
try {
 let ready = false
 for(let i=0;i<100;i++) { try { await fetch(base + '/api/auth/csrf', { signal: AbortSignal.timeout(1000) }); ready = true; break } catch { await new Promise(r=>setTimeout(r,100)) } }
 assert.ok(ready, 'production server did not start')
 for(const route of ['/api/admin/posts','/api/admin/files','/api/admin/comments','/api/admin/users','/api/admin/projects','/api/admin/settings','/api/admin/stats','/api/admin/api-keys','/api/admin/ai/settings','/api/admin/ai/threads','/api/admin/ai/index/status','/api/posts']) await req(route, { cookies:null, expected:401 })
 await req('/api/init', { method:'POST',data:{},cookies:null,expected:[403,404] })
 await login()
 console.log('PASS: admin routes and credential session')
 await req('/api/posts', { method:'POST', data:{}, headers:{Origin:'https://attacker.invalid'}, expected:403 })
 await req('/api/posts', { method:'POST', form:'{invalid', headers:{'Content-Type':'application/json'}, expected:400 })
 await req('/api/posts', { method:'POST', data:{content:'x'.repeat(1024*1024)}, expected:413 })
 const cat = (await req('/api/categories',{method:'POST',data:{name:'开发手记',slug:'integration-notes'},expected:201})).data.category
 const tag = (await req('/api/tags',{method:'POST',data:{name:'测试',slug:'integration-test'},expected:201})).data.tag
 const imageFixture = await sharp({create:{width:64,height:64,channels:3,background:'#6dbbe6'}}).webp().toBuffer()
 const mediaForm = new FormData(); mediaForm.set('file',new Blob([imageFixture],{type:'image/webp'}),'sky.webp');mediaForm.set('compressionMode','ORIGINAL');mediaForm.set('visibility','private')
 const media = (await req('/api/admin/files',{method:'POST',form:mediaForm,expected:201})).data.file
 assert.ok(media.id)
 await req(`/_next/image?url=${encodeURIComponent('/api/files/'+media.id)}&w=640&q=75`,{cookies:null,expected:404})
 await req(`/api/files/${media.id}`,{cookies:null,expected:[403,404]})
 await req(`/api/files/${media.id}`)
 await req(`/_next/image?url=${encodeURIComponent('/api/files/'+media.id)}&w=640&q=75`,{cookies:null,expected:404})
 const publicPost = (await req('/api/posts',{method:'POST',data:{title:'Integration public article',content:'Public body marker before protection',excerpt:'可公开摘要',status:'PUBLISHED',categoryId:cat.id,tags:[tag.id]},expected:201})).data.post
 const secretMarker = 'CONFIDENTIAL-BODY-ONLY-5821'
 const secretPost = (await req('/api/posts',{method:'POST',data:{title:'Integration protected article',content:`${secretMarker}\n![图片](/api/files/${media.id})\n[附件](/api/files/${media.id})`,status:'PUBLISHED',isProtected:true,password:'article-pass-1'},expected:201})).data.post
 const reuseSuffix = '\n\n# 图片说明\n测试正文'
 const reusedPost = (await req('/api/posts',{method:'POST',data:{title:'公开复用私有媒体回归',content:`/api/files/${media.id}${reuseSuffix}`,status:'PUBLISHED'},expected:201})).data.post
 assert.ok(reusedPost.content.endsWith(reuseSuffix),'Markdown paragraphs must remain intact')
 const reusedUrl = reusedPost.content.split('\n')[0]
 assert.notEqual(reusedUrl, `/api/files/${media.id}`)
 const reusedImage = await req(reusedUrl,{cookies:null})
 assert.equal(reusedImage.res.headers.get('cache-control'),'private, no-cache, must-revalidate')
 const publicEtag = reusedImage.res.headers.get('etag')
 assert.ok(publicEtag)
 for (const method of ['GET','HEAD']) {
   const validated = await req(reusedUrl,{method,cookies:null,headers:{'If-None-Match':publicEtag},expected:304})
   assert.equal(validated.text,'')
 }
 await req(`/api/files/${media.id}`,{cookies:null,expected:404})
 console.log('PASS: public media reuse isolates URLs and preserves Markdown paragraphs')
 const publishedHTML = await req(`/posts/${secretPost.slug}`,{cookies:null})
 assert.ok(!publishedHTML.text.includes(secretMarker), 'secret body must not enter HTML or RSC payload')
 const search = await req('/api/search?q=CONFIDENTIAL',{cookies:null}); assert.ok(!search.text.includes(secretPost.id))
 await req(`/api/posts/protected?slug=${secretPost.slug}`,{cookies:null,expected:401})
 await req('/api/posts/unlock',{method:'POST',data:{slug:secretPost.slug,password:'wrong'},cookies:visitor,expected:401})
 await req('/api/posts/unlock',{method:'POST',data:{slug:secretPost.slug,password:'article-pass-1'},cookies:visitor})
 const body = await req(`/api/posts/protected?slug=${secretPost.slug}`,{cookies:visitor}); assert.ok(body.text.includes(secretMarker))
 const image = await req(`/api/files/${media.id}`,{cookies:visitor}); assert.match(image.res.headers.get('cache-control'),/no-store/)
 await req(`/api/posts/${secretPost.id}`,{method:'PATCH',data:{password:'article-pass-2'}})
 await req(`/api/files/${media.id}`,{cookies:visitor,headers:{'If-None-Match':image.res.headers.get('etag')},expected:404})
 await req(`/api/files/${media.id}`,{cookies:visitor,expected:[403,404]})
 await req(`/api/posts/protected?slug=${secretPost.slug}`,{cookies:visitor,expected:401})
 const original = await req(`/posts/${publicPost.slug}`,{cookies:null}); assert.ok(original.text.includes('Public body marker before protection'))
 await req(`/api/posts/${publicPost.id}`,{method:'PATCH',data:{isProtected:true,password:'new-password'}})
 const hidden = await req(`/posts/${publicPost.slug}`,{cookies:null}); assert.ok(!hidden.text.includes('Public body marker before protection'),'cached public content must disappear immediately after locking')
 await req(`/api/posts/${publicPost.id}`,{method:'PATCH',data:{isProtected:false}})

 mediaForm.delete('visibility')
 const formerlyPublic=(await req('/api/admin/files',{method:'POST',form:mediaForm,expected:201})).data.file
 const cacheBeforeLock = await req(`/api/files/${formerlyPublic.id}`,{cookies:null})
 await req(`/api/posts/${publicPost.id}`,{method:'PATCH',data:{content:`Public body marker before protection\n![public image](/api/files/${formerlyPublic.id})`}})
 const relocked=(await req(`/api/posts/${publicPost.id}`,{method:'PATCH',data:{isProtected:true,password:'new-password'}})).data.post
 assert.ok(!relocked.content.includes(formerlyPublic.id),'locking must assign a new private file URL')
 await req(`/api/files/${formerlyPublic.id}`,{cookies:null,expected:404})
 for (const method of ['GET','HEAD']) {
   const revoked = await req(`/api/files/${formerlyPublic.id}`,{method,cookies:null,headers:{'If-None-Match':cacheBeforeLock.res.headers.get('etag')},expected:404})
   assert.match(revoked.res.headers.get('cache-control'),/no-store/)
 }
 await req(`/api/posts/${publicPost.id}`,{method:'PATCH',data:{isProtected:false}})

 console.log('PASS: origin/body limits, taxonomy, post CRUD, private images and cache revocation')
 await req(`/api/comments?slug=${publicPost.slug}`,{method:'POST',data:{content:'First comment <script>alert(1)</script>'},expected:201})
 await prisma.comment.createMany({data:Array.from({length:64},(_,i)=>({postId:publicPost.id,content:`分页评论 ${i}`,authorId:user.id,status:'APPROVED'}))})
 const first = (await req(`/api/comments?slug=${publicPost.slug}`,{cookies:null})).data
 const second = (await req(`/api/comments?slug=${publicPost.slug}&page=2`,{cookies:null})).data
 assert.equal(first.comments.length,30); assert.equal(second.comments.length,30); assert.equal(first.pagination.totalPages,3)
 assert.ok(!JSON.stringify(first).includes(email)); assert.ok(!first.comments.some(c=>second.comments.some(s=>s.id===c.id)))
 const reply = (await req(`/api/comments?slug=${publicPost.slug}`,{method:'POST',data:{content:'跨页回复回归',parentId:first.comments[0].id},expected:201})).data.comment
 const located = (await req(`/api/comments?slug=${publicPost.slug}&commentId=${reply.id}`,{cookies:null})).data
 assert.equal(located.pagination.page,3)
 assert.equal(located.targetFound,true)
 assert.ok(located.comments.some(c=>c.id===reply.id))
 assert.ok(located.parentContexts.some(c=>c.id===first.comments[0].id))
 assert.ok(!JSON.stringify(located).includes(email))
 const pendingTarget = await prisma.comment.create({data:{postId:publicPost.id,content:'尚未审核的秘密',status:'PENDING'}})
 const pendingResult = (await req(`/api/comments?slug=${publicPost.slug}&commentId=${pendingTarget.id}`,{cookies:null})).data
 assert.equal(pendingResult.targetFound,false)
 assert.ok(!JSON.stringify(pendingResult).includes('尚未审核的秘密'))
 console.log('PASS: comment target pagination, cross-page context and moderation boundary')
 await req(`/api/comments?slug=${secretPost.slug}`,{cookies:null,expected:403})
 const recent = await req('/api/comments/recent',{cookies:null});assert.ok(!recent.text.includes(email))
 const draft = (await req('/api/posts',{method:'POST',data:{title:'Integration draft',content:'Draft secret content',status:'DRAFT'},expected:201})).data.post
 await req(`/api/comments?slug=${draft.slug}`,{cookies:null,expected:404})
 console.log('PASS: comments pagination, sanitization and privacy')
 const key = (await req('/api/admin/api-keys',{method:'POST',data:{name:'Integration readonly',permissions:['POST_READ']},expected:201})).data
 await req('/api/plugin/posts',{cookies:null,headers:{Authorization:`Bearer ${key.plainKey}`}})
 await req('/api/plugin/posts',{method:'POST',cookies:null,headers:{Authorization:`Bearer ${key.plainKey}`},data:{title:'Forbidden'},expected:403})
 await req(`/api/admin/api-keys/${key.apiKey.id}`,{method:'DELETE'})
 await req('/api/plugin/posts',{cookies:null,headers:{Authorization:`Bearer ${key.plainKey}`},expected:401})
 const limitedKey = (await req('/api/admin/api-keys',{method:'POST',data:{name:'Private media access regression',permissions:['POST_CREATE','POST_UPDATE']},expected:201})).data
 const limitedHeaders = { Authorization: `Bearer ${limitedKey.plainKey}` }
 const beforeMediaCount = await prisma.mediaFile.count()
 for (const status of ['DRAFT','PUBLISHED']) {
   for (const field of ['content','coverImage']) {
     await req('/api/plugin/posts',{method:'POST',cookies:null,headers:limitedHeaders,data:{title:`Blocked ${status} ${field}`,content:'body',status,[field]:`/api/files/${media.id}`},expected:403})
   }
 }
 await req(`/api/plugin/posts/${publicPost.id}`,{method:'PATCH',cookies:null,headers:limitedHeaders,data:{coverImage:`/api/files/${media.id}`},expected:403})
 assert.equal(await prisma.mediaFile.count(),beforeMediaCount,'denied requests must not create public copies')
 await req(`/api/files/${media.id}`,{cookies:null,expected:404})
 const allowedPlugin = (await req('/api/plugin/posts',{method:'POST',cookies:null,headers:limitedHeaders,data:{title:'Allowed public media',content:`![](${reusedUrl})`,status:'PUBLISHED'},expected:201})).data.post
 await req(`/api/plugin/posts/${allowedPlugin.id}`,{method:'PATCH',cookies:null,headers:limitedHeaders,data:{title:'Updated public media'}})
 await req(`/api/admin/api-keys/${limitedKey.apiKey.id}`,{method:'DELETE'})
 console.log('PASS: plugin private media reuse denied, public create/update preserved')

 const peer = await prisma.user.create({data:{email:'peer-security@papergrid.invalid',name:'Peer admin',role:'ADMIN',password:await bcrypt.hash(password,10)}})
 await login(password,peer.email)
 const peerKey = (await req('/api/admin/api-keys',{method:'POST',data:{name:'Peer revocation',permissions:['POST_READ','POST_CREATE']},expected:201})).data
 const peerHeaders = { Authorization: `Bearer ${peerKey.plainKey}` }
 const oldPeerCookies = new Map(jar)
 await login()
 await req('/api/plugin/posts',{cookies:null,headers:peerHeaders})
 await req(`/api/admin/users/${peer.id}`,{method:'PATCH',data:{role:'ADMIN'}})
 assert.equal((await prisma.user.findUnique({where:{id:peer.id}})).sessionVersion,0,'saving the same role must not revoke sessions')
 await req('/api/admin/posts',{cookies:new Map(oldPeerCookies)})
 await req(`/api/admin/users/${peer.id}`,{method:'PATCH',data:{role:'USER'}})
 assert.equal((await prisma.user.findUnique({where:{id:peer.id}})).sessionVersion,1)
 await req('/api/admin/posts',{cookies:new Map(oldPeerCookies),expected:401})
 assert.equal((await prisma.apiKey.findUnique({where:{id:peerKey.apiKey.id}})).enabled,false)
 await req('/api/plugin/posts',{cookies:null,headers:peerHeaders,expected:401})
 await req('/api/plugin/posts',{method:'POST',cookies:null,headers:peerHeaders,data:{title:'Blocked revoked writer',content:'body'},expected:401})
 await req(`/api/admin/users/${peer.id}`,{method:'PATCH',data:{role:'ADMIN'}})
 assert.equal((await prisma.user.findUnique({where:{id:peer.id}})).sessionVersion,2)
 await req('/api/admin/posts',{cookies:new Map(oldPeerCookies),expected:401})
 await req('/api/posts',{method:'POST',cookies:new Map(oldPeerCookies),data:{title:'Old JWT must stay revoked',content:'body'},expected:401})
 await req('/api/plugin/posts',{cookies:null,headers:peerHeaders,expected:401})
 await login(password,peer.email)
 await req('/api/admin/posts')
 console.log('PASS: role restoration never revives old JWTs; same-role saves and fresh login still work')
 const deleteKey = (await req('/api/admin/api-keys',{method:'POST',data:{name:'Deleted owner',permissions:['POST_READ','POST_CREATE']},expected:201})).data
 await login()
 await req(`/api/admin/users/${peer.id}`,{method:'DELETE'})
 assert.equal((await prisma.apiKey.findUnique({where:{id:deleteKey.apiKey.id}})).enabled,false)
 const deleteHeaders = { Authorization: `Bearer ${deleteKey.plainKey}` }
 await req('/api/plugin/posts',{cookies:null,headers:deleteHeaders,expected:401})
 // Even an old enabled key whose creator was deleted must fail authentication.
 await prisma.apiKey.update({where:{id:deleteKey.apiKey.id},data:{enabled:true}})
 await req('/api/plugin/posts',{method:'POST',cookies:null,headers:deleteHeaders,data:{title:'Blocked orphan writer',content:'body'},expected:401})
 const unownedRaw = `eak_${randomBytes(32).toString('base64url')}`
 await prisma.apiKey.create({data:{name:'Legacy unowned',keyHash:createHash('sha256').update(unownedRaw).digest('hex'),keyPrefix:unownedRaw.slice(0,8),permissions:['POST_READ']}})
 await req('/api/plugin/posts',{cookies:null,headers:{Authorization:`Bearer ${unownedRaw}`},expected:401})
 console.log('PASS: demotion/deletion revoke keys, promotion cannot revive them, orphan keys rejected')
 const writeKey = (await req('/api/admin/api-keys',{method:'POST',data:{name:'Password boundary regression',permissions:['POST_READ','POST_CREATE','POST_UPDATE']},expected:201})).data
 const pluginHeaders = { Authorization: `Bearer ${writeKey.plainKey}` }
 const readableCopy = (await req('/api/plugin/posts',{method:'POST',cookies:null,headers:pluginHeaders,data:{title:'Authorized private media reuse',content:`![](/api/files/${media.id})`,coverImage:`/api/files/${media.id}`,status:'PUBLISHED'},expected:201})).data.post
 assert.notEqual(readableCopy.coverImage,`/api/files/${media.id}`)
 await req(readableCopy.coverImage,{cookies:null})
 await req(`/api/files/${media.id}`,{cookies:null,expected:404})
 const longPassword = '汉'.repeat(25)
 await req('/api/plugin/posts',{method:'POST',cookies:null,headers:pluginHeaders,data:{title:'Invalid multi-byte password',content:'Password boundary fixture',status:'PUBLISHED',isProtected:true,password:longPassword},expected:400})
 const pluginPost = (await req('/api/plugin/posts',{method:'POST',cookies:null,headers:pluginHeaders,data:{title:'Valid multi-byte password',content:'Password boundary fixture',status:'PUBLISHED',isProtected:true,password:'汉'.repeat(24)},expected:201})).data.post
 await req(`/api/plugin/posts/${pluginPost.id}`,{method:'PATCH',cookies:null,headers:pluginHeaders,data:{password:longPassword},expected:400})
 await req('/api/posts/unlock',{method:'POST',cookies:new Map(),data:{slug:pluginPost.slug,password:'汉'.repeat(24)}})
 await req(`/api/admin/api-keys/${writeKey.apiKey.id}`,{method:'DELETE'})
 for(const route of ['/api/admin/posts?page=99999999999999999999','/api/admin/files?page=2&limit=1','/api/admin/comments?page=2&limit=1','/api/admin/users?page=2&limit=1','/api/admin/ai/threads?page=2','/api/admin/ai/index/status','/api/admin/ai/settings','/api/admin/settings','/api/admin/stats']) await req(route)
 await req('/api/admin/ai/settings',{method:'PATCH',data:{baseUrl:'https://127.0.0.1/v1'},expected:400})
 await req('/api/admin/ai/settings',{method:'PATCH',data:{baseUrl:'http://example.com/v1'},expected:400})

 const thread = (await req('/api/admin/ai/threads',{method:'POST',data:{title:'Conversation persistence',model:'deepseek-v4-flash'},expected:201})).data.thread
 await req(`/api/admin/ai/threads/${thread.id}`,{method:'PUT',data:{messages:[{role:'user',content:'A stored question'},{role:'assistant',content:'A stored answer'}]}})
 const savedThread = (await req(`/api/admin/ai/threads/${thread.id}`)).data.thread
 assert.equal(savedThread.messages.length,2)
 await req(`/api/admin/ai/threads/${thread.id}`,{method:'DELETE'})
 await req(`/api/admin/ai/threads/${thread.id}`,{expected:404})
 const project = (await req('/api/admin/projects',{method:'POST',data:{name:'测试作品',url:'https://example.com',description:'Synthetic project'},expected:201})).data.project
 await req(`/api/admin/projects/${project.id}`,{method:'PATCH',data:{name:'Updated project'}})
 await req(`/api/admin/projects/${project.id}`,{method:'DELETE'})
 const attachmentForm = new FormData();attachmentForm.set('file',new Blob(['%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF'],{type:'application/pdf'}),'attachment.pdf');attachmentForm.set('visibility','private')
 const attachment = (await req('/api/admin/files',{method:'POST',form:attachmentForm,expected:201})).data.file
 const doc = await req(`/api/files/${attachment.id}`);assert.equal(doc.res.headers.get('content-disposition'),'attachment')
 await req(`/api/files/${attachment.id}`,{cookies:null,expected:404})
 await req(`/api/files/${attachment.id}`,{method:'HEAD'})
 const imagesOnly = await req('/api/admin/files?kind=images');assert.ok(!imagesOnly.data.files.some(f=>f.id===attachment.id))
 await req(`/api/admin/files/${attachment.id}`,{method:'DELETE'})
 await req(`/api/admin/files/${media.id}`,{method:'DELETE',expected:409})
 await req(`/api/posts/${draft.id}`,{method:'DELETE'})
 await req(`/api/posts/${draft.id}`,{expected:404})
 await req('/api/admin/users?role=INVALID',{expected:400})
 await req('/api/posts?status=INVALID',{expected:400})
 await req('/api/posts',{method:'POST',data:{title:42,content:'Invalid shape'},expected:400})
 const commentId=first.comments[0].id
 await req(`/api/admin/comments/${commentId}`,{method:'PATCH',data:{status:'SPAM'}})
 const visibleComments=(await req(`/api/comments?slug=${publicPost.slug}`,{cookies:null})).data.comments
 assert.ok(!visibleComments.some(c=>c.id===commentId))
 await req(`/api/admin/comments/${commentId}`,{method:'DELETE'})

 console.log('PASS: plugin permissions and administrative endpoints')
 const sitemap = await req('/sitemap/0.xml', {cookies:null})
 const sitemapLocations = [...sitemap.text.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => new URL(match[1], base).pathname)
 assert.ok(sitemapLocations.includes('/'), 'sitemap must include the configured site root')
 assert.ok(sitemapLocations.includes(`/posts/${publicPost.slug}`), 'sitemap must include newly published public posts')
 assert.ok(!sitemap.text.includes(`/posts/${secretPost.slug}</loc>`), 'sitemap must omit protected posts')
 for(const route of ['/','/posts','/archive','/categories','/tags','/about','/yaji','/auth/signin','/admin','/admin/posts','/admin/posts/new','/admin/files','/admin/works','/admin/categories','/admin/tags','/admin/comments','/admin/users','/admin/api-keys','/admin/ai','/admin/import-export','/admin/styles','/admin/settings']) {
  const page = await req(route,{expected:route === '/admin/posts/new' ? [200,307] : 200}); assert.ok(!page.text.includes('Application error:'),`${route} rendering error`)
 }
 const form = new FormData();form.set('type','backup_export')
 const task = (await req('/api/admin/import-export/tasks',{method:'POST',form,expected:[200,201,202]})).data.task
 assert.ok(task?.id)
 let result
 for(let i=0;i<60;i++) {result=(await req(`/api/admin/import-export/tasks/${task.id}`)).data.task;if(result.status==='succeeded'||result.status==='failed')break;await new Promise(r=>setTimeout(r,200))}
 assert.equal(result.status,'succeeded',result.error)
 const download = await req(`/api/admin/import-export/tasks/${task.id}/download`)
 await req(`/api/admin/import-export/tasks/${task.id}/download`)
 assert.ok(download.text.includes(secretMarker))

 const restoredPayload = JSON.parse(download.text)
 const protectedRecord = restoredPayload.data.posts.find(p=>p.slug===secretPost.slug)
 protectedRecord.slug='restored-passwordless'; protectedRecord.title='Restored locked article';protectedRecord.content='RESTORED-LOCKED-CONTENT';delete protectedRecord.passwordHash
 const importForm = new FormData(); importForm.set('type','backup_import');importForm.set('file',new Blob([JSON.stringify({meta:restoredPayload.meta,data:{posts:[protectedRecord]}})],{type:'application/json'}),'restore.json')
 const importTask=(await req('/api/admin/import-export/tasks',{method:'POST',form:importForm,expected:201})).data.task
 let imported
 for(let i=0;i<60;i++){imported=(await req(`/api/admin/import-export/tasks/${importTask.id}`)).data.task;if(['succeeded','failed'].includes(imported.status))break;await new Promise(r=>setTimeout(r,200))}
 assert.equal(imported.status,'succeeded',imported.error)
 const restored=await prisma.post.findUnique({where:{slug:'restored-passwordless'}})
 assert.equal(restored.isProtected,true);assert.equal(restored.passwordHash,null)
 const restoredHTML=await req('/posts/restored-passwordless',{cookies:null});assert.ok(!restoredHTML.text.includes('RESTORED-LOCKED-CONTENT'))
 // Slug contracts: random article URLs, stable legacy URLs and safe taxonomy paths.
 const slugKey = (await req('/api/admin/api-keys',{method:'POST',data:{name:'Slug regression',permissions:['POST_CREATE']},expected:201})).data
 const createdSlugs = await Promise.all(Array.from({length:16},async(_,index)=>{
   const plugin = index >= 8
   const created = (await req(plugin?'/api/plugin/posts':'/api/posts',{
     method:'POST',cookies:plugin?null:jar,
     headers:plugin?{'x-api-key':slugKey.plainKey}:{},
     data:{title:'相同中文标题',content:'Concurrent slug regression',status:'DRAFT'},expected:201,
   })).data.post
   assert.match(created.slug,/^[A-Za-z0-9_-]{16}$/)
   return created.slug
 }))
 assert.equal(new Set(createdSlugs).size,16)
 await req(`/api/admin/api-keys/${slugKey.apiKey.id}`,{method:'DELETE'})
 const legacy = await prisma.post.create({data:{title:'Legacy title',slug:'legacy-stable-url',content:'LEGACY-LINK-BODY',status:'PUBLISHED',authorId:user.id}})
 const renamed = (await req(`/api/posts/${legacy.id}`,{method:'PATCH',data:{title:'修改后的标题'}})).data.post
 assert.equal(renamed.slug,'legacy-stable-url')
 assert.ok((await req('/posts/legacy-stable-url',{cookies:null})).text.includes('LEGACY-LINK-BODY'))
 for(const kind of ['categories','tags']) {
   const field = kind==='categories'?'category':'tag'
   for(const slug of ['broken/path','broken#fragment','']) {
     await req(`/api/${kind}`,{method:'POST',data:{name:`Invalid ${kind}`,slug},expected:400})
   }
   const entity = (await req(`/api/${kind}`,{method:'POST',data:{name:`中文测试-${kind}`,slug:`中文-${kind}`},expected:201})).data[field]
   await req(`/${kind}/${encodeURIComponent(entity.slug)}`,{cookies:null})
   await req(`/api/${kind}/${entity.id}`,{method:'PATCH',data:{slug:''},expected:400})
   await req(`/api/${kind}/${entity.id}`,{method:'PATCH',data:{slug:'broken?query'},expected:400})
   const renamed = (await req(`/api/${kind}/${entity.id}`,{method:'PATCH',data:{name:`新名称-${kind}`}})).data[field]
   assert.equal(renamed.slug,entity.slug)
 }
 console.log('PASS: concurrent random article slugs, legacy URLs and taxonomy validation')
 await runPluginApiRegression({ req, prisma, user, imageFixture, mediaRoot: path.join(dir, 'uploads') })
 const latencies=[]
 await Promise.all(Array.from({length:4},async()=>{for(let i=0;i<12;i++){const start=performance.now();await req(i%2?'/posts?page=2':'/api/settings/public',{cookies:null});latencies.push(performance.now()-start)}}))
 latencies.sort((a,b)=>a-b)
 console.log('4 concurrent readers, 48 requests: p50='+Math.round(latencies[24])+'ms p95='+Math.round(latencies[45])+'ms')

 const beforeEmailChange = new Map(jar)
 const changedEmail = 'renamed-integration@papergrid.invalid'
 await req('/api/admin/account',{method:'PATCH',data:{currentPassword:password,newEmail:changedEmail}})
 await req('/api/admin/settings',{cookies:new Map(beforeEmailChange),expected:401})
 await login(password,changedEmail)
 await req('/api/admin/account',{method:'PATCH',data:{currentPassword:password,newEmail:email}})
 await req('/api/admin/settings',{cookies:new Map(beforeEmailChange),expected:401})
 await login()
 console.log('PASS: restoring the previous email cannot revive an old JWT')
 const spacedPassword = ` ${password} `
 await req('/api/admin/account',{method:'PATCH',data:{currentPassword:password,newPassword:spacedPassword,confirmPassword:spacedPassword}})
 await req('/api/admin/settings',{expected:401})
 await login(spacedPassword)
 await req('/api/admin/account',{method:'PATCH',data:{currentPassword:spacedPassword,newPassword:password,confirmPassword:password}})
 await login()
 await prisma.user.update({where:{id:user.id},data:{role:'USER'}})
 await req('/api/admin/settings',{expected:401})
 console.log('PASS: page rendering, durable export download and session revocation')
 console.log(`PASS: ${count} production HTTP assertions`)
 console.log('Production memory MiB:', Object.fromEntries(Object.entries(JSON.parse(await readFile(path.join(dir, 'metrics.json'), 'utf8'))).map(([k,v])=>[k,Math.round(v/1024/1024)])))
 await writeFile(path.join(dir,'result.json'),JSON.stringify({requests:count,passed:true},null,2))
} catch(error) { console.error(error); await writeFile(path.join(dir,'server.log'),serverLog,{mode:0o600}); process.exitCode=1 }
finally { child.kill('SIGTERM'); await prisma.$disconnect(); }
