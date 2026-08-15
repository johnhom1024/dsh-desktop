import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const dir = process.argv[2] ?? 'release'
const files = readdirSync(dir).filter((name) => name.endsWith('.dmg'))
const lines = files.map((name) => {
  const hash = createHash('sha256').update(readFileSync(join(dir, name))).digest('hex')
  return `${hash}  ${name}`
})
writeFileSync(join(dir, 'SHA256SUMS.txt'), `${lines.join('\n')}\n`)
console.log(lines.join('\n'))
