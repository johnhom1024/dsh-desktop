import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const source = join(root, 'build', 'icon-source.svg')
const output = join(root, 'build', 'icon.png')

if (!existsSync(source)) {
  throw new Error(`missing ${source}`)
}

const converters = [
  ['rsvg-convert', ['-w', '1024', '-h', '1024', source, '-o', output]],
  ['magick', [source, '-background', 'none', '-gravity', 'center', '-extent', '1024x1024', output]],
]

let lastError = ''
for (const [command, args] of converters) {
  const result = spawnSync(command, args, { encoding: 'utf8' })
  if (result.status === 0 && existsSync(output)) {
    process.stdout.write(`${output}\n`)
    process.exit(0)
  }
  lastError = result.stderr || result.error?.message || `${command} failed`
}

throw new Error(`failed to rasterize desktop icon: ${lastError}`)
