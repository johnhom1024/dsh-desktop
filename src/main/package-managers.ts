import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { DEFAULT_LOCAL_PORT } from './runtime.js'

export type PackageManagerId = 'pnpm' | 'npm' | 'yarn' | 'bun'

export type PackageManagerOption = {
  id: PackageManagerId
  label: string
  commandPath: string
  args: string[]
  preview: string
}

export const DSH_PACKAGE = '@deepseek-ai/dsh'
// Always pin @latest so dlx/npx do not reuse a stale resolved version.
export const DSH_PACKAGE_LATEST = `${DSH_PACKAGE}@latest`

// pnpm 10+ may ask which install scripts to approve. Desktop spawn has no TTY,
// so skip that prompt and allow builds for this already-confirmed launch.
export const PNPM_DLX_PREFIX = [
  '--config.dangerouslyAllowAllBuilds=true',
  'dlx',
  DSH_PACKAGE_LATEST,
] as const

// Self-managed pnpm home (pnpm's official standalone install location) keeps a
// stable, user-controlled pnpm (typically 11.x). PATH lookup can hit a corepack
// shim from another runtime whose version drifts with each project's
// packageManager field, so prefer the standalone binary when it exists.
export function userPnpmBin(home: string = homedir()): string | null {
  const candidates = [join(home, 'Library', 'pnpm', 'pnpm'), join(home, '.local', 'share', 'pnpm', 'pnpm')]
  return candidates.find((item) => existsSync(item)) ?? null
}

const CANDIDATES: Array<{
  id: PackageManagerId
  label: string
  bin: string
  prefix: string[]
}> = [
  { id: 'pnpm', label: 'pnpm', bin: 'pnpm', prefix: [...PNPM_DLX_PREFIX] },
  { id: 'npm', label: 'npm / npx', bin: 'npx', prefix: ['-y', DSH_PACKAGE_LATEST] },
  { id: 'yarn', label: 'yarn', bin: 'yarn', prefix: ['dlx', DSH_PACKAGE_LATEST] },
  { id: 'bun', label: 'bun', bin: 'bunx', prefix: [DSH_PACKAGE_LATEST] },
]

export function harnessWebArgs(prefix: string[] = [], port: number = DEFAULT_LOCAL_PORT): string[] {
  // The desktop host loads the URL itself in a WebContentsView; stop the
  // child `dsh web` process from also handing the URL to the default browser.
  return [...prefix, 'web', '--no-open', '--port', String(port)]
}

export function previewFor(commandPath: string, args: string[]): string {
  const commandName = commandPath.split('/').pop() ?? commandPath
  return [commandName, ...args].join(' ')
}

export function detectPackageManagers(
  lookup: (bin: string) => Promise<string | null>,
  port: number = DEFAULT_LOCAL_PORT,
  pnpmOverride?: string | null,
): Promise<PackageManagerOption[]> {
  const found: PackageManagerOption[] = []

  return (async () => {
    for (const candidate of CANDIDATES) {
      let commandPath = await lookup(candidate.bin)
      if (!commandPath) {
        continue
      }
      // Prefer the user's standalone pnpm over whatever `which` found (e.g. a
      // corepack shim pinned to an old version by some project's
      // packageManager field).
      if (candidate.id === 'pnpm' && pnpmOverride) {
        commandPath = pnpmOverride
      }

      const args = harnessWebArgs(candidate.prefix, port)
      found.push({
        id: candidate.id,
        label: candidate.label,
        commandPath,
        args,
        preview: previewFor(commandPath, args),
      })
    }

    return found
  })()
}

export function lookupOnPath(bin: string): Promise<string | null> {
  return new Promise((resolve) => {
    execFile('which', [bin], (error, stdout) => {
      if (error) {
        resolve(null)
        return
      }
      resolve(stdout.trim() || null)
    })
  })
}
