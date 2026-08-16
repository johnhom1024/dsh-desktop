import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const dir = process.argv[2] ?? 'release'
const only = process.argv.slice(3)
const files = readdirSync(dir)
  .filter((name) => name.endsWith('.dmg'))
  .filter((name) => only.length === 0 || only.some((part) => name.includes(part)))
  .sort()
const lines = files.map((name) => {
  const hash = createHash('sha256').update(readFileSync(join(dir, name))).digest('hex')
  return `${hash}  ${name}`
})
const outName = only.length === 1 ? `SHA256SUMS-${only[0]}.txt` : 'SHA256SUMS.txt'
writeFileSync(join(dir, outName), `${lines.join('\n')}\n`)
console.log(lines.join('\n'))
