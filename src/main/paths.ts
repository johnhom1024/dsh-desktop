import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

export function preloadFile(name: string): string {
  return join(here, '..', 'preload', name)
}

export function rendererFile(name: string): string {
  return join(here, '..', 'renderer', name)
}
