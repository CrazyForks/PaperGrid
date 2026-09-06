import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import sharp from 'sharp'
import { mkdir } from 'node:fs/promises'

export async function runPluginApiRegression({ req, prisma, user, imageFixture, mediaRoot }) {
  const permissions = ['POST_READ','POST_CREATE','POST_UPDATE','POST_DELETE',
    'CATEGORY_READ','CATEGORY_CREATE','CATEGORY_UPDATE','CATEGORY_DELETE',
    'TAG_READ','TAG_CREATE','TAG_UPDATE','TAG_DELETE','IMAGE_UPLOAD']
  const makeKey = async (name, permissions) => (await req('/api/admin/api-keys',{method:'POST',data:{name,permissions},expected:201})).data
  const full = await makeKey('Plugin workflow',permissions)
  assert.deepEqual([...full.apiKey.permissions].sort(),[...permissions].sort())
  const legacy = await makeKey('Article only',['POST_CREATE'])
  const readOnly = await makeKey('Taxonomy read',['CATEGORY_READ','TAG_READ'])
  const uploadOnly = await makeKey('Upload only',['IMAGE_UPLOAD'])
  const options = key => ({cookies:null,headers:{'x-api-key':key.plainKey}})
  const fullOptions = options(full)
  const taxonomy = {}
  for (const kind of ['categories','tags']) {
    const field = kind==='categories'?'category':'tag'
    await req(`/api/plugin/${kind}`,{expected:401}) // Admin cookie is not an API key.
    await req(`/api/plugin/${kind}`,{...options(legacy),expected:403})
    await req(`/api/plugin/${kind}`,{...options(readOnly)})
    for (const [method,route] of [['POST',`/api/plugin/${kind}`],['PATCH',`/api/plugin/${kind}/missing`],['DELETE',`/api/plugin/${kind}/missing`]]) {
      await req(route,{...options(readOnly),method,data:{name:'blocked'},expected:403})
    }
    const created = (await req(`/api/plugin/${kind}`,{...fullOptions,method:'POST',data:{name:`插件${kind}`},expected:201})).data[field]
    taxonomy[kind] = created
    assert.equal(created.slug,`插件${kind}`)
    const list = (await req(`/api/plugin/${kind}?slug=${encodeURIComponent(created.slug)}&page=1&limit=1`,fullOptions)).data
    assert.equal(list[kind][0].id,created.id)
    assert.equal(list.pagination.total,1)
    assert.equal((await req(`/api/plugin/${kind}/${created.id}`,fullOptions)).data[field].id,created.id)
    await req(`/api/plugin/${kind}`,{...fullOptions,method:'POST',data:{name:'Different name',slug:created.slug},expected:409})
    await req(`/api/plugin/${kind}/${created.id}`,{...fullOptions,method:'PATCH',data:{slug:'bad/path'},expected:400})
    const updated = (await req(`/api/plugin/${kind}/${created.id}`,{...fullOptions,method:'PATCH',data:{name:`更新${kind}`}})).data[field]
    assert.equal(updated.slug,created.slug)
    await req(`/api/plugin/${kind}/missing`,{...fullOptions,expected:404})
  }
  const upload = async (key, visibility, data=imageFixture, name='fixture.webp', expected=201) => {
    const form=new FormData();form.set('file',new Blob([data],{type:'image/webp'}),name);form.set('compressionMode','ORIGINAL')
    if(visibility!==undefined)form.set('visibility',visibility)
    return req('/api/plugin/images',{...options(key),method:'POST',form,expected})
  }
  await req('/api/plugin/images',{method:'POST',data:{},expected:401})
  await req('/api/plugin/images',{...options(legacy),method:'POST',data:{},expected:403})
  const image = (await upload(full)).data.file
  assert.equal(image.private,true)
  assert.equal(image.mimeType,'image/webp')
  assert.equal((await prisma.mediaFile.findUnique({where:{id:image.id}})).uploadedByApiKeyId,full.apiKey.id)
  const originalImage = await prisma.mediaFile.findUniqueOrThrow({where:{id:image.id}})
  await mkdir(`${mediaRoot}/rollback-directory`,{recursive:true})
  await prisma.mediaFile.update({where:{id:image.id},data:{storagePath:'rollback-directory'}})
  await req(`/api/admin/files/${image.id}`,{method:'DELETE',expected:500})
  const restoredImage = await prisma.mediaFile.findUniqueOrThrow({where:{id:image.id}})
  assert.equal(restoredImage.uploadedByApiKeyId,full.apiKey.id,'failed deletion must preserve API key ownership')
  assert.equal(restoredImage.private,true)
  await prisma.mediaFile.update({where:{id:image.id},data:{storagePath:originalImage.storagePath}})
  await req(image.url,{cookies:null,expected:404})
  await upload(full,'public',Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'),'fake.png',400)
  await upload(full,'public',Buffer.from('%PDF-1.4\nattachment'),'document.pdf',400)
  await upload(full,'invalid',imageFixture,'bad.webp',400)
  const publicImage=(await upload(full,'public')).data.file
  await req(publicImage.url,{cookies:null})
  const largeImage=await sharp(randomBytes(800*800*3),{raw:{width:800,height:800,channels:3}}).png().toBuffer()
  assert.ok(largeImage.length>1024*1024)
  await upload(full,'private',largeImage,'large.png')
  const otherImage=(await upload(uploadOnly)).data.file
  await req('/api/plugin/posts',{...options(uploadOnly),method:'POST',data:{title:'No create permission',content:'body'},expected:403})
  await req('/api/plugin/posts',{...fullOptions,method:'POST',data:{title:'Steal unbound upload',content:`![image](${otherImage.url})`},expected:403})
  await req(`/api/admin/api-keys/${uploadOnly.apiKey.id}`,{method:'PATCH',data:{permissions:['IMAGE_UPLOAD','POST_CREATE']}})
  await req('/api/plugin/posts',{...options(uploadOnly),method:'POST',data:{title:'Own upload without read permission',content:`![image](${otherImage.url})`,status:'PUBLISHED'},expected:201})
  await req(otherImage.url,{cookies:null})
  const adminOwned=await prisma.mediaFile.create({data:{originalName:'admin.txt',storagePath:'unbound-admin-private.txt',mimeType:'text/plain',ext:'txt',size:1,private:true,uploadedById:user.id}})
  await req('/api/plugin/posts',{...fullOptions,method:'POST',data:{title:'Steal administrator upload',content:`![image](/api/files/${adminOwned.id})`},expected:403})
  const draft=(await req('/api/plugin/posts',{...fullOptions,method:'POST',data:{title:'Plugin private image draft',content:`![image](${image.url})`,coverImage:image.url,categoryId:taxonomy.categories.id,tags:[taxonomy.tags.id]},expected:201})).data.post
  await req(image.url,{cookies:null,expected:404})
  await req(`/api/plugin/categories/${taxonomy.categories.id}`,{...fullOptions,method:'DELETE',expected:409})
  await req(`/api/plugin/posts/${draft.id}`,{...fullOptions,method:'PATCH',data:{status:'PUBLISHED'}})
  await req(image.url,{cookies:null})
  await req(`/api/plugin/tags/${taxonomy.tags.id}`,{...fullOptions,method:'DELETE'})
  assert.ok(await prisma.post.findUnique({where:{id:draft.id}}))
  assert.equal(await prisma.postTag.count({where:{postId:draft.id}}),0)
  await req(`/api/plugin/posts/${draft.id}`,{...fullOptions,method:'DELETE'})
  await req(`/api/plugin/categories/${taxonomy.categories.id}`,{...fullOptions,method:'DELETE'})
  for(const kind of ['categories','tags'])await req(`/api/plugin/${kind}/${taxonomy[kind].id}`,{...fullOptions,expected:404})
  console.log('PASS: scoped plugin taxonomy CRUD and private image upload-to-publish workflow')

  const body={title:'Idempotent concurrent HTTP article',content:'One article only',status:'DRAFT'}
  const headers={...fullOptions.headers,'Idempotency-Key':'publish-request-1'}
  const requests=await Promise.all(Array.from({length:8},()=>req('/api/plugin/posts',{cookies:null,headers,method:'POST',data:body,expected:201})))
  const saved=requests[0].data.post
  for(const response of requests)assert.deepEqual(response.data.post,saved)
  assert.equal(await prisma.post.count({where:{title:body.title}}),1)
  assert.equal(await prisma.apiIdempotency.count({where:{apiKeyId:full.apiKey.id}}),1)
  const reordered={status:'DRAFT',content:body.content,title:body.title}
  const replay=await req('/api/plugin/posts',{cookies:null,headers,method:'POST',data:reordered,expected:201})
  assert.deepEqual(replay.data.post,saved)
  assert.equal(replay.res.headers.get('idempotency-replayed'),'true')
  await req('/api/plugin/posts',{cookies:null,headers,method:'POST',data:{...body,content:'different'},expected:409})
  await req('/api/plugin/posts',{...fullOptions,headers:{...fullOptions.headers,'Idempotency-Key':' '},method:'POST',data:body,expected:400})
  const other=(await req('/api/plugin/posts',{...options(legacy),headers:{...options(legacy).headers,'Idempotency-Key':'publish-request-1'},method:'POST',data:body,expected:201})).data.post
  assert.notEqual(other.id,saved.id)
  const publishedBody={title:'Published idempotent cache regression',content:'Article A',status:'PUBLISHED'}
  const publishedHeaders={...fullOptions.headers,'Idempotency-Key':'published-cache-request'}
  const published=(await req('/api/plugin/posts',{cookies:null,headers:publishedHeaders,method:'POST',data:publishedBody,expected:201})).data.post
  const neighbor=(await req('/api/plugin/posts',{...fullOptions,method:'POST',data:{title:'Unrelated cached article',content:'Article B',status:'PUBLISHED'},expected:201})).data.post
  await req(`/posts/${neighbor.slug}`,{cookies:null})
  const marker='UNRELATED_NAVIGATION_CACHE_REGRESSION'
  await prisma.post.create({data:{title:marker,slug:'unrelated-navigation-cache-regression',content:'Article C',status:'PUBLISHED',authorId:user.id,publishedAt:new Date(new Date(neighbor.publishedAt).getTime()+1)}})
  assert.ok(!(await req(`/posts/${neighbor.slug}`,{cookies:null})).text.includes(marker),'navigation should remain cached before replay')
  await req('/api/plugin/posts',{cookies:null,headers:publishedHeaders,method:'POST',data:publishedBody,expected:201})
  assert.ok(!(await req(`/posts/${neighbor.slug}`,{cookies:null})).text.includes(marker),'idempotent replay must preserve unrelated navigation caches')
  await req(`/api/plugin/posts/${published.id}`,{...fullOptions,method:'PATCH',data:{title:'Actual published update'}})
  assert.ok((await req(`/posts/${neighbor.slug}`,{cookies:null})).text.includes(marker),'real article changes must still refresh navigation')
  await req(`/api/admin/api-keys/${full.apiKey.id}`,{method:'PATCH',data:{permissions:['CATEGORY_READ']}})
  await req('/api/plugin/posts',{cookies:null,headers,method:'POST',data:body,expected:403})
  await req(`/api/admin/api-keys/${full.apiKey.id}`,{method:'PATCH',data:{permissions,enabled:false}})
  await req('/api/plugin/posts',{cookies:null,headers,method:'POST',data:body,expected:401})
  await req(`/api/admin/api-keys/${full.apiKey.id}`,{method:'DELETE'})
  assert.equal(await prisma.apiIdempotency.count({where:{apiKeyId:full.apiKey.id}}),0)
  assert.equal((await prisma.mediaFile.findUnique({where:{id:image.id}})).uploadedByApiKeyId,null)
  for(const key of [legacy,readOnly,uploadOnly])await req(`/api/admin/api-keys/${key.apiKey.id}`,{method:'DELETE'})
  console.log('PASS: durable idempotent creation, conflicting requests, key scope and revocation before replay')
}
