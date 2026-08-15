import { execFile } from 'node:child_process'

export type PackageManagerId = 'pnpm' | 'npm' | 'yarn' | 'bun'

export type PackageManagerOption = {
  id: PackageManagerId
  label: string
  commandPath: string
  args: string[]
  preview: string
}

const DSH_PACKAGE = '@deepseek-ai/dsh'

const CANDIDATES: Array<{
  id: PackageManagerId
  label: string
  bin: string
  args: string[]
}> = [
  { id: 'pnpm', label: 'pnpm', bin: 'pnpm', args: ['dlx', DSH_PACKAGE, 'web', '--port', '0'] },
  { id: 'npm', label: 'npm / npx', bin: 'npx', args: ['-y', DSH_PACKAGE, 'web', '--port', '0'] },
  { id: 'yarn', label: 'yarn', bin: 'yarn', args: ['dlx', DSH_PACKAGE, 'web', '--port', '0'] },
  { id: 'bun', label: 'bun', bin: 'bunx', args: [DSH_PACKAGE, 'web', '--port', '0'] },
]

export function previewFor(commandPath: string, args: string[]): string {
  const commandName = commandPath.split('/').pop() ?? commandPath
  return [commandName, ...args].join(' ')
}

export async function detectPackageManagers(
  lookup: (bin: string) => Promise<string | null>,
): Promise<PackageManagerOption[]> {
  const found: PackageManagerOption[] = []

  for (const candidate of CANDIDATES) {
    const commandPath = await lookup(candidate.bin)
    if (!commandPath) {
      continue
    }

    found.push({
      id: candidate.id,
      label: candidate.label,
      commandPath,
      args: [...candidate.args],
      preview: previewFor(commandPath, candidate.args),
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
