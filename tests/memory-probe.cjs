// Optional instrumentation for the isolated production HTTP suite.
// Loaded with Node's --require before the standalone server starts.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = require('node:fs')
let peakRss = 0
const output = process.env.PAPERGRID_METRICS_PATH
if (output) setInterval(() => {
 const usage = process.memoryUsage()
 peakRss = Math.max(peakRss, usage.rss)
 fs.writeFileSync(output, JSON.stringify({ ...usage, peakRss }))
}, 500).unref()
