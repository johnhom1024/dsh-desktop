export type ConnectionMode = 'smart' | 'local-only' | 'remote'
export type PackageManagerId = 'pnpm' | 'npm' | 'yarn' | 'bun'
export type InstanceKind = 'local' | 'remote'

export const DEFAULT_LOCAL_PORT = 3080

export type WindowBounds = {
  x: number
  y: number
  width: number
  height: number
}

export type Instance = {
  id: string
  name: string
  kind: InstanceKind
  url: string
}

export type Settings = {
  instances: Instance[]
  activeInstanceId: string
  openAtLogin: boolean
  lastPackageManager?: PackageManagerId
  windowBounds?: WindowBounds
}

export type DshPackage = {
  packageRoot: string
  version: string
}

export type RuntimeSource =
  | { kind: 'reuse-local'; url: string }
  | { kind: 'path-dsh'; command: string }
  | { kind: 'pnpm-dlx'; packageRoot: string; version: string }
  | { kind: 'npx-cache'; packageRoot: string; version: string }
  | { kind: 'bundled'; packageRoot: string; version: string }
  | { kind: 'remote'; url: string }
  | { kind: 'none' }

export function localWebUrl(port: number = DEFAULT_LOCAL_PORT): string {
  return `http://127.0.0.1:${port}`
}

export const DEFAULT_LOCAL_INSTANCE_NAME = 'deepseek-harness'

export function defaultLocalInstance(port: number = DEFAULT_LOCAL_PORT): Instance {
  return {
    id: `local-${port}`,
    name: DEFAULT_LOCAL_INSTANCE_NAME,
    kind: 'local',
    url: localWebUrl(port),
  }
}

export function defaultSettings(): Settings {
  const local = defaultLocalInstance()
  return {
    instances: [local],
    activeInstanceId: local.id,
    openAtLogin: false,
  }
}

export function activeInstance(settings: Settings): Instance | undefined {
  return settings.instances.find((item) => item.id === settings.activeInstanceId) ?? settings.instances[0]
}

export function localPortFromSettings(settings: Settings): number {
  const local = settings.instances.find((item) => item.kind === 'local')
  if (!local) {
    return DEFAULT_LOCAL_PORT
  }
  try {
    const port = Number(new URL(local.url).port)
    return Number.isInteger(port) && port >= 1 && port <= 65535 ? port : DEFAULT_LOCAL_PORT
  } catch {
    return DEFAULT_LOCAL_PORT
  }
}

export async function resolveRuntime(input: {
  settings: Settings
  probe: (url: string) => Promise<boolean>
}): Promise<RuntimeSource> {
  const active = activeInstance(input.settings)
  if (active?.kind === 'remote') {
    return { kind: 'remote', url: active.url }
  }

  const reuseUrl = active?.kind === 'local' ? active.url : localWebUrl(localPortFromSettings(input.settings))
  if (await input.probe(reuseUrl)) {
    return { kind: 'reuse-local', url: reuseUrl }
  }

  return { kind: 'none' }
}
