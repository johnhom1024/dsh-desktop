export type ConnectionMode = 'smart' | 'local-only' | 'remote'

export const DEFAULT_LOCAL_PORT = 3080

export type Settings = {
  connectionMode: ConnectionMode
  localPort: number
  remoteUrl?: string
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

export async function resolveRuntime(input: {
  settings: Settings
  probe: (url: string) => Promise<boolean>
  whichDsh: () => Promise<string | null>
  findPnpmDlx: () => Promise<DshPackage | null>
  findNpxCache: () => Promise<DshPackage | null>
  bundled: DshPackage | null
}): Promise<RuntimeSource> {
  if (input.settings.connectionMode === 'remote' && input.settings.remoteUrl) {
    return { kind: 'remote', url: input.settings.remoteUrl }
  }

  const reuseUrl = localWebUrl(input.settings.localPort ?? DEFAULT_LOCAL_PORT)
  if (await input.probe(reuseUrl)) {
    return { kind: 'reuse-local', url: reuseUrl }
  }

  const command = await input.whichDsh()
  if (command) {
    return { kind: 'path-dsh', command }
  }

  const pnpmDlx = await input.findPnpmDlx()
  if (pnpmDlx) {
    return { kind: 'pnpm-dlx', ...pnpmDlx }
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
