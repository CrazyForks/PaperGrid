import { writeFile } from 'node:fs/promises'
import sharp from 'sharp'

// Eye-only animation frames derived from the approved Arona artwork.
// Run with the registered half-closed and closed-eye edits, in that order.
// Intermediate full-frame edits are never used by the page.
const [halfPath, closedPath] = process.argv.slice(2)
if (!halfPath || !closedPath) {
  throw new Error('Usage: node scripts/prepare-arona-expressions.mjs <half.png> <closed.png>')
}
const crop = { left: 568, top: 328, width: 406, height: 236 }
const mask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1254" height="1254">
  <defs><filter id="soft"><feGaussianBlur stdDeviation="1.5"/></filter></defs>
  <g fill="white" filter="url(#soft)">
    <path d="M581 337 Q656 320 740 352 L744 471 Q660 492 587 469 Q573 409 581 337Z"/>
    <path d="M938 471 L960 482 L940 551 L905 551 Q925 519 938 471Z"/>
  </g>
</svg>`)
const frames = await Promise.all(
  [halfPath, closedPath].map(async (file, index) => {
    const metadata = await sharp(file).metadata()
    if (metadata.width !== 1254 || metadata.height !== 1254) {
      throw new Error(
        'Expression frame must be registered at 1254 × 1254; align it before cropping'
      )
    }
    // The closed-eye edit is slightly cooler than the approved skin; match its surrounding tone.
    const frame = index === 1 ? sharp(file).linear([1, 1, 1], [0, -4, -7]) : sharp(file)
    const masked = await frame
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
await writeFile('public/assets/arona-expressions.webp', atlas)
console.log(`Expression atlas: ${atlas.length} bytes (half / closed), original artwork unchanged.`)
