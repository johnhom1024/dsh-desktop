import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  DEFAULT_LOCAL_INSTANCE_NAME,
  DEFAULT_LOCAL_PORT,
  defaultLocalInstance,
  defaultSettings,
  type ConnectionMode,
  type Instance,
  type PackageManagerId,
  type Settings,
  type WindowBounds,
} from './runtime.js'

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

function remoteInstanceId(url: string): string {
  try {
    const parsed = new URL(url)
    const host = parsed.hostname
    const port = parsed.port || (parsed.protocol === 'https:' ? '443' : '80')
    return `remote-${host}-${port}`
  } catch {
    return 'remote-unknown'
  }
}

function remoteInstanceName(url: string): string {
  try {
    const parsed = new URL(url)
    return parsed.port ? `${parsed.hostname}:${parsed.port}` : parsed.host
  } catch {
    return url
  }
}

function isLegacyLocalName(name: string, url: string): boolean {
  try {
    const port = new URL(url).port || String(DEFAULT_LOCAL_PORT)
    return name === `本机 ${port}` || name === '本机'
  } catch {
    return name === '本机'
  }
}

function parseInstance(value: unknown): Instance | null {
  if (!value || typeof value !== 'object') {
    return null
  }
  const candidate = value as { id?: unknown; name?: unknown; kind?: unknown; url?: unknown }
  if (candidate.kind !== 'local' && candidate.kind !== 'remote') {
    return null
  }
  if (typeof candidate.id !== 'string' || !candidate.id) {
    return null
  }
  if (typeof candidate.name !== 'string' || !candidate.name) {
    return null
  }
  if (typeof candidate.url !== 'string' || !isHttpUrl(candidate.url)) {
    return null
  }
  return {
    id: candidate.id,
    name:
      candidate.kind === 'local' && isLegacyLocalName(candidate.name, candidate.url)
        ? DEFAULT_LOCAL_INSTANCE_NAME
        : candidate.name,
    kind: candidate.kind,
    url: candidate.url,
  }
}

export type SettingsInput = {
  connectionMode?: unknown
  remoteUrl?: unknown
  localPort?: unknown
  instances?: unknown
  activeInstanceId?: unknown
  openAtLogin?: unknown
  lastPackageManager?: unknown
  windowBounds?: unknown
}

function migrateFromLegacy(candidate: SettingsInput): Instance[] {
  const port = parseLocalPort(candidate.localPort) ?? DEFAULT_LOCAL_PORT
  const instances: Instance[] = [defaultLocalInstance(port)]
  if (typeof candidate.remoteUrl === 'string' && isHttpUrl(candidate.remoteUrl)) {
    instances.push({
      id: remoteInstanceId(candidate.remoteUrl),
      name: remoteInstanceName(candidate.remoteUrl),
      kind: 'remote',
      url: candidate.remoteUrl,
    })
  }
  return instances
}

function normalize(raw: unknown): Settings {
  if (!raw || typeof raw !== 'object') {
    return defaultSettings()
  }

  const candidate = raw as SettingsInput
  const fromList = Array.isArray(candidate.instances)
    ? candidate.instances.map(parseInstance).filter((item): item is Instance => item !== null)
    : []
  const instances = fromList.length > 0 ? fromList : migrateFromLegacy(candidate)
  if (instances.length === 0) {
    return defaultSettings()
  }

  const connectionMode: ConnectionMode | null =
    candidate.connectionMode === 'local-only' ||
    candidate.connectionMode === 'remote' ||
    candidate.connectionMode === 'smart'
      ? candidate.connectionMode
      : null

  let activeInstanceId =
    typeof candidate.activeInstanceId === 'string' &&
    instances.some((item) => item.id === candidate.activeInstanceId)
      ? candidate.activeInstanceId
      : instances[0]!.id

  if (!candidate.activeInstanceId && connectionMode === 'remote') {
    const remote = instances.find((item) => item.kind === 'remote')
    if (remote) {
      activeInstanceId = remote.id
    }
  }

  const next: Settings = {
    instances,
    activeInstanceId,
    openAtLogin: candidate.openAtLogin === true,
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
    return defaultSettings()
  }
}

export function saveSettings(userDataDir: string, settings: SettingsInput): boolean {
  if (settings.localPort !== undefined && parseLocalPort(settings.localPort) === null) {
    return false
  }
  if (typeof settings.remoteUrl === 'string' && settings.remoteUrl && !isHttpUrl(settings.remoteUrl)) {
    return false
  }
  if (Array.isArray(settings.instances)) {
    if (settings.instances.length === 0) {
      return false
    }
    if (settings.instances.some((item) => parseInstance(item) === null)) {
      return false
    }
  }

  const next = normalize(settings)
  if (next.instances.length === 0) {
    return false
  }

  mkdirSync(userDataDir, { recursive: true })
  writeFileSync(join(userDataDir, 'settings.json'), `${JSON.stringify(next, null, 2)}\n`, 'utf8')
  return true
}
