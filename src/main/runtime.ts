export type ConnectionMode = 'smart' | 'local-only' | 'remote'

export type Settings = {
  connectionMode: ConnectionMode
  remoteUrl?: string
}

export type DshPackage = {
  packageRoot: string
  version: string
}

export type RuntimeSource =
  | { kind: 'reuse-local'; url: string }
  | { kind: 'path-dsh'; command: string }
  | { kind: 'npx-cache'; packageRoot: string; version: string }
  | { kind: 'bundled'; packageRoot: string; version: string }
  | { kind: 'remote'; url: string }
  | { kind: 'none' }

const LOCAL_WEB_URL = 'http://127.0.0.1:3080'

export async function resolveRuntime(input: {
  settings: Settings
  probe: (url: string) => Promise<boolean>
  whichDsh: () => Promise<string | null>
  findNpxCache: () => Promise<DshPackage | null>
  bundled: DshPackage | null
}): Promise<RuntimeSource> {
  if (input.settings.connectionMode === 'remote' && input.settings.remoteUrl) {
    return { kind: 'remote', url: input.settings.remoteUrl }
  }

  if (await input.probe(LOCAL_WEB_URL)) {
    return { kind: 'reuse-local', url: LOCAL_WEB_URL }
  }

  const command = await input.whichDsh()
  if (command) {
    return { kind: 'path-dsh', command }
  }

  const cached = await input.findNpxCache()
  if (cached) {
    return { kind: 'npx-cache', ...cached }
  }

  if (input.bundled) {
    return { kind: 'bundled', ...input.bundled }
  }

  return { kind: 'none' }
}
