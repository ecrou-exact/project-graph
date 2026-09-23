// The report protocol from the command line (text only: the picture of the
// graph needs a browser):
//   npm run report -- map.json [report.md] [--image graph.png]
// Accepts a Pivograph document or an Open Contributions Descriptor.
import { readFileSync, writeFileSync } from 'node:fs'
import { parseDocument } from '../src/model.js'
import { isOcd, ocdToDocument } from '../src/ocd.js'
import { buildReport } from '../src/report.js'

const args = process.argv.slice(2)
const imageAt = args.indexOf('--image')
const image = imageAt >= 0 ? args.splice(imageAt, 2)[1] : undefined
const [input, output] = args
if (!input) {
  console.error('Usage: npm run report -- <map.json> [report.md] [--image graph.png]')
  process.exit(1)
}
const raw = JSON.parse(readFileSync(input, 'utf8'))
const { doc, errors } = parseDocument(isOcd(raw) ? ocdToDocument(raw) : raw)
if (!doc) {
  console.error(errors.join('\n'))
  process.exit(1)
}
const report = buildReport(doc, { image })
if (output) writeFileSync(output, report)
else process.stdout.write(report)
