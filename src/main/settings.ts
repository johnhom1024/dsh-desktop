import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DEFAULT_LOCAL_PORT, type ConnectionMode, type Settings } from './runtime.js'

const DEFAULT_SETTINGS: Settings = { connectionMode: 'smart', localPort: DEFAULT_LOCAL_PORT }

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

export function parseLocalPort(value: unknown): number | null {
  const port = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return null
  }
  return port
}

function normalize(raw: unknown): Settings {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_SETTINGS }
  }

  const candidate = raw as { connectionMode?: unknown; remoteUrl?: unknown; localPort?: unknown }
  const connectionMode: ConnectionMode =
    candidate.connectionMode === 'local-only' ||
    candidate.connectionMode === 'remote' ||
    candidate.connectionMode === 'smart'
      ? candidate.connectionMode
      : 'smart'

  const localPort = parseLocalPort(candidate.localPort) ?? DEFAULT_LOCAL_PORT
  const next: Settings = { connectionMode, localPort }

  if (typeof candidate.remoteUrl === 'string' && isHttpUrl(candidate.remoteUrl)) {
    next.remoteUrl = candidate.remoteUrl
  }

  return next
}

export function loadSettings(userDataDir: string): Settings {
  try {
    return normalize(JSON.parse(readFileSync(join(userDataDir, 'settings.json'), 'utf8')))
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export function saveSettings(
  userDataDir: string,
  settings: Omit<Settings, 'localPort'> & { localPort?: unknown },
): boolean {
  if (settings.localPort !== undefined && parseLocalPort(settings.localPort) === null) {
    return false
  }
  const next = normalize(settings)
  if (settings.remoteUrl && !next.remoteUrl) {
    return false
  }

  mkdirSync(userDataDir, { recursive: true })
  writeFileSync(join(userDataDir, 'settings.json'), `${JSON.stringify(next, null, 2)}\n`, 'utf8')
  return true
}
