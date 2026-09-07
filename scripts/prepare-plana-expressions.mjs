import { writeFile } from 'node:fs/promises'
import sharp from 'sharp'

// Registered eye-only edits for plana-touch.webp. Keep the approved portrait intact.
const [halfPath, closedPath] = process.argv.slice(2)
if (!halfPath || !closedPath) {
  throw new Error('Usage: node scripts/prepare-plana-expressions.mjs <half.png> <closed.png>')
}
// Keep these bounds in sync with the Plana expressionRegion CSS.
const crop = { left: 800, top: 500, width: 180, height: 135 }
const mask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1254" height="1254">
  <defs><filter id="soft"><feGaussianBlur stdDeviation="1.2"/></filter></defs>
  <path fill="white" filter="url(#soft)"
    d="M829 519 Q867 495 946 538 L970 558 L949 590 Q923 630 868 619 Q837 611 814 580 L827 562Z"/>
</svg>`)
const frames = await Promise.all(
  [halfPath, closedPath].map(async (file) => {
    const { width, height } = await sharp(file).metadata()
    if (width !== 1254 || height !== 1254) {
      throw new Error('Expression frame must be registered at 1254 × 1254 before cropping')
    }
    const masked = await sharp(file)
      .ensureAlpha()
      .composite([{ input: mask, blend: 'dest-in' }])
      .png()
      .toBuffer()
    return sharp(masked).extract(crop).png().toBuffer()
  })
)
const atlas = await sharp({
  create: { width: crop.width * 2, height: crop.height, channels: 4, background: '#00000000' },
})
  .composite(frames.map((input, index) => ({ input, left: index * crop.width, top: 0 })))
  .webp({ quality: 94, alphaQuality: 100, effort: 6 })
  .toBuffer()
await writeFile('public/assets/plana-expressions.webp', atlas)
console.log(`Plana eye atlas: ${atlas.length} bytes (half / closed), original portrait unchanged.`)
