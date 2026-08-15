import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DEFAULT_LOCAL_PORT, type ConnectionMode, type PackageManagerId, type Settings, type WindowBounds } from './runtime.js'

const DEFAULT_SETTINGS: Settings = {
  connectionMode: 'smart',
  localPort: DEFAULT_LOCAL_PORT,
  openAtLogin: false,
}

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

function parseWindowBounds(value: unknown): WindowBounds | null {
  if (!value || typeof value !== 'object') {
    return null
  }
  const candidate = value as { x?: unknown; y?: unknown; width?: unknown; height?: unknown }
  const x = typeof candidate.x === 'number' ? candidate.x : NaN
  const y = typeof candidate.y === 'number' ? candidate.y : NaN
  const width = typeof candidate.width === 'number' ? candidate.width : NaN
  const height = typeof candidate.height === 'number' ? candidate.height : NaN
  if (![x, y, width, height].every(Number.isFinite)) {
    return null
  }
  return { x, y, width, height }
}

function normalize(raw: unknown): Settings {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_SETTINGS }
  }

  const candidate = raw as {
    connectionMode?: unknown
    remoteUrl?: unknown
    localPort?: unknown
    openAtLogin?: unknown
    lastPackageManager?: unknown
    windowBounds?: unknown
  }
  const connectionMode: ConnectionMode =
    candidate.connectionMode === 'local-only' ||
    candidate.connectionMode === 'remote' ||
    candidate.connectionMode === 'smart'
      ? candidate.connectionMode
      : 'smart'

  const localPort = parseLocalPort(candidate.localPort) ?? DEFAULT_LOCAL_PORT
  const next: Settings = {
    connectionMode,
    localPort,
    openAtLogin: candidate.openAtLogin === true,
  }

  if (typeof candidate.remoteUrl === 'string' && isHttpUrl(candidate.remoteUrl)) {
    next.remoteUrl = candidate.remoteUrl
  }

  if (
    candidate.lastPackageManager === 'pnpm' ||
    candidate.lastPackageManager === 'npm' ||
    candidate.lastPackageManager === 'yarn' ||
    candidate.lastPackageManager === 'bun'
  ) {
    next.lastPackageManager = candidate.lastPackageManager
  }

  const bounds = parseWindowBounds(candidate.windowBounds)
  if (bounds) {
    next.windowBounds = bounds
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
  settings: Omit<Settings, 'localPort' | 'openAtLogin'> & {
    localPort?: unknown
    openAtLogin?: unknown
    lastPackageManager?: unknown
    windowBounds?: unknown
  },
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
