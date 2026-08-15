import { appendFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
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
    return '未连接'
  }

  try {
    const parsed = new URL(url)
    if (source.kind === 'remote') {
      return `已连接 · 远程 ${parsed.host}`
    }
    if (source.kind === 'reuse-local') {
      return `已连接 · 本机 ${parsed.port || '80'}`
    }
    return `已连接 · ${source.kind} ${parsed.host}`
  } catch {
    return '已连接'
  }
}

export function appendHostLog(userDataDir: string, fileName: string, text: string): void {
  mkdirSync(userDataDir, { recursive: true })
  const stamp = new Date().toISOString()
  const line = text.endsWith('\n') ? text : `${text}\n`
  appendFileSync(join(userDataDir, fileName), `[${stamp}] ${line}`, 'utf8')
}
