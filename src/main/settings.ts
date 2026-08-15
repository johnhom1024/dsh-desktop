import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ConnectionMode, Settings } from './runtime.js'

const DEFAULT_SETTINGS: Settings = { connectionMode: 'smart' }

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function normalize(raw: unknown): Settings {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_SETTINGS }
  }

  const candidate = raw as { connectionMode?: unknown; remoteUrl?: unknown }
  const connectionMode: ConnectionMode =
    candidate.connectionMode === 'local-only' ||
    candidate.connectionMode === 'remote' ||
    candidate.connectionMode === 'smart'
      ? candidate.connectionMode
      : 'smart'

  if (typeof candidate.remoteUrl === 'string' && isHttpUrl(candidate.remoteUrl)) {
    return { connectionMode, remoteUrl: candidate.remoteUrl }
  }

  return { connectionMode }
}

export function loadSettings(userDataDir: string): Settings {
  try {
    return normalize(JSON.parse(readFileSync(join(userDataDir, 'settings.json'), 'utf8')))
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export function saveSettings(userDataDir: string, settings: Settings): boolean {
  const next = normalize(settings)
  if (settings.remoteUrl && !next.remoteUrl) {
    return false
  }

  mkdirSync(userDataDir, { recursive: true })
  writeFileSync(join(userDataDir, 'settings.json'), `${JSON.stringify(next, null, 2)}\n`, 'utf8')
  return true
}
