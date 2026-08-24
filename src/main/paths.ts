import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

export function preloadFile(name: string): string {
  return join(here, '..', 'preload', name)
}

export function rendererFile(name: string): string {
  return join(here, '..', 'renderer', name)
}

export function desktopIconFile(): string {
  return join(here, '..', '..', 'build', 'icon.png')
}

export function devIconFile(): string {
  return join(here, '..', '..', 'build', 'icon-dev.png')
}

export function trayIconFile(kind: 'normal' | 'dim' = 'normal'): string {
  return join(here, '..', '..', 'build', kind === 'dim' ? 'tray-whale-dim.png' : 'tray-whale.png')
}

export function resolveDesktopIconFile(exists: (file: string) => boolean, candidates: string[]): string | null {
  return candidates.find((file) => exists(file)) ?? null
}
