import { execFile } from 'node:child_process'
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

// pnpm 10+ may ask which install scripts to approve. Desktop spawn has no TTY,
// so skip that prompt and allow builds for this already-confirmed launch.
export const PNPM_DLX_PREFIX = [
  '--config.dangerouslyAllowAllBuilds=true',
  'dlx',
  DSH_PACKAGE,
] as const

const CANDIDATES: Array<{
  id: PackageManagerId
  label: string
  bin: string
  prefix: string[]
}> = [
  { id: 'pnpm', label: 'pnpm', bin: 'pnpm', prefix: [...PNPM_DLX_PREFIX] },
  { id: 'npm', label: 'npm / npx', bin: 'npx', prefix: ['-y', DSH_PACKAGE] },
  { id: 'yarn', label: 'yarn', bin: 'yarn', prefix: ['dlx', DSH_PACKAGE] },
  { id: 'bun', label: 'bun', bin: 'bunx', prefix: [DSH_PACKAGE] },
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

export async function detectPackageManagers(
  lookup: (bin: string) => Promise<string | null>,
  port: number = DEFAULT_LOCAL_PORT,
): Promise<PackageManagerOption[]> {
  const found: PackageManagerOption[] = []

  for (const candidate of CANDIDATES) {
    const commandPath = await lookup(candidate.bin)
    if (!commandPath) {
      continue
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
