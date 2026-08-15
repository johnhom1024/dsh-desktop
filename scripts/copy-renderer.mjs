import { copyFileSync, mkdirSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const src = join(root, 'src', 'renderer')
const dest = join(root, 'dist', 'renderer')

mkdirSync(dest, { recursive: true })

for (const file of readdirSync(src)) {
  if (file.endsWith('.html')) {
    copyFileSync(join(src, file), join(dest, file))
  }
}
