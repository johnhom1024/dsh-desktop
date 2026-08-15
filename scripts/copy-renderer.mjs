import { copyFileSync, mkdirSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const rendererSrc = join(root, 'src', 'renderer')
const rendererDest = join(root, 'dist', 'renderer')
const preloadSrc = join(root, 'src', 'preload')
const preloadDest = join(root, 'dist', 'preload')

mkdirSync(rendererDest, { recursive: true })
mkdirSync(preloadDest, { recursive: true })

for (const file of readdirSync(rendererSrc)) {
  if (file.endsWith('.html')) {
    copyFileSync(join(rendererSrc, file), join(rendererDest, file))
  }
}

for (const file of readdirSync(preloadSrc)) {
  if (file.endsWith('.cjs')) {
    copyFileSync(join(preloadSrc, file), join(preloadDest, file))
  }
}

