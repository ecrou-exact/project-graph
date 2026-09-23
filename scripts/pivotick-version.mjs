// Prints the installed Pivotick version next to the latest one published on npm.
import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

const installed = JSON.parse(
  readFileSync(new URL('../node_modules/pivotick/package.json', import.meta.url), 'utf8')
).version

let latest = '?'
try {
  latest = execSync('npm view pivotick version', { encoding: 'utf8' }).trim()
} catch {
  // offline: only the installed version can be reported
}

console.log(`Pivotick installed: ${installed} — latest on npm: ${latest}`)
if (latest !== '?' && latest !== installed) {
  console.log('Run `npm run update:pivotick` to upgrade.')
}
