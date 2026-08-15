import { copyFileSync, mkdirSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const preloadSrc = join(root, 'src', 'preload')
const preloadDest = join(root, 'dist', 'preload')

mkdirSync(preloadDest, { recursive: true })

for (const file of readdirSync(preloadSrc)) {
  if (file.endsWith('.cjs')) {
    copyFileSync(join(preloadSrc, file), join(preloadDest, file))
  }
}
