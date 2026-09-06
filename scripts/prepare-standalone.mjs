import { cp, mkdir, copyFile, access, rm } from 'node:fs/promises'
import path from 'node:path'
import { getLoadablePath } from 'sqlite-vec'

const output = '.next/standalone'
// These committed assets are required by the default Hero; never ship a partial character.
for (const asset of [
  'arona-touch-eyes.webp',
  'arona-expressions.webp',
  'blue-archive/arona-loading.webp',
  'blue-archive/loading-desktop.webp',
  'blue-archive/loading-mobile.webp',
  'blue-archive/triangle-grid.webp',
]) {
  await access(path.join('public/assets', asset)).catch(() => {
    throw new Error(`首屏资源缺失：public/assets/${asset}，请确认资源已随仓库检出`)
  })
}
// Also remove leftovers when rebuilding into an existing standalone directory.
await rm(`${output}/public/uploads`, { recursive: true, force: true })
await cp('public', `${output}/public`, {
  recursive: true, filter: source => path.resolve(source) !== path.resolve('public/uploads'),
})
await cp('.next/static', `${output}/.next/static`, { recursive: true })
// The platform extension is optional in npm, but required at runtime for RAG.
const extension = getLoadablePath()
const platformPackage = path.basename(path.dirname(extension))
const destination = path.join(output, 'node_modules', platformPackage)
await mkdir(destination, { recursive: true })
await copyFile(extension, path.join(destination, path.basename(extension)))
console.log('[standalone] static assets and vector extension prepared')
