import { mkdir, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

// Official Arona character artwork, separate from the source code license.
// Source: https://bluearchive.jp/
// © NEXON Games & Yostar. Keep the complete character.
const url = 'https://webusstatic.yo-star.com/bluearchive_jp_web/img/men2.db0183c0.png'
const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(30_000) })
if (!response.ok || !response.body) throw new Error(`Artwork download failed: ${response.status}`)
const chunks = []
let size = 0
for await (const chunk of response.body) {
  size += chunk.length
  if (size > 12 * 1024 * 1024) throw new Error('Artwork exceeds the download limit')
  chunks.push(chunk)
}
const image = sharp(Buffer.concat(chunks), { limitInputPixels: 1920 * 1080 })
const metadata = await image.metadata()
if (metadata.width !== 503 || metadata.height !== 967) {
  throw new Error('The upstream illustration has changed; check its source before using it')
}
const output = await image.webp({ quality: 88, effort: 5 }).toBuffer()
const destination = path.resolve('public/assets/arona-cutout.webp')
await mkdir(path.dirname(destination), { recursive: true })
await writeFile(`${destination}.tmp`, output)
await rename(`${destination}.tmp`, destination)
console.log(`Installed official Arona character artwork (${Math.round(output.length / 1024)} KiB).`)
