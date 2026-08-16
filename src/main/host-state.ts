import { appendFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { t } from '../i18n/index.js'
import type { RuntimeSource } from './runtime.js'

export type WindowBounds = {
  x: number
  y: number
  width: number
  height: number
}

export function clampWindowBounds(bounds: WindowBounds): WindowBounds {
  return {
    x: bounds.x,
    y: bounds.y,
    width: Math.max(800, bounds.width),
    height: Math.max(600, bounds.height),
  }
}

export function formatTrayStatus(source: RuntimeSource, url: string | null): string {
  if (!url || source.kind === 'none') {
    return t('tray.disconnected')
  }

  try {
    const parsed = new URL(url)
    if (source.kind === 'remote') {
      return t('tray.connectedRemote', { host: parsed.host })
    }
    if (source.kind === 'reuse-local') {
      return t('tray.connectedLocal', { port: parsed.port || '80' })
    }
    return t('tray.connectedKind', { kind: source.kind, host: parsed.host })
  } catch {
    return t('tray.connected')
  }
}

export function appendHostLog(userDataDir: string, fileName: string, text: string): void {
  mkdirSync(userDataDir, { recursive: true })
  const stamp = new Date().toISOString()
  const line = text.endsWith('\n') ? text : `${text}\n`
  appendFileSync(join(userDataDir, fileName), `[${stamp}] ${line}`, 'utf8')
}
