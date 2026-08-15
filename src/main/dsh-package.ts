import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { join } from 'node:path'

const DSH_NAME = '@deepseek-ai/dsh'

export type LocatedDshPackage = {
  packageRoot: string
  version: string
}

type RankedPackage = LocatedDshPackage & { mtimeMs: number }

export function readDshPackage(packageRoot: string): { version: string } | null {
  try {
    const pkg = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')) as {
      name?: string
      version?: string
    }
    if (pkg.name === DSH_NAME && typeof pkg.version === 'string') {
      return { version: pkg.version }
    }
    return null
  } catch {
    return null
  }
}

function locateAt(packageRoot: string): RankedPackage | null {
  const info = readDshPackage(packageRoot)
  if (!info) {
    return null
  }

  let resolved = packageRoot
  try {
    resolved = realpathSync(packageRoot)
  } catch {
    if (!existsSync(packageRoot)) {
      return null
    }
  }

  let mtimeMs = 0
  try {
    mtimeMs = statSync(resolved).mtimeMs
  } catch {
    return null
  }

  return { packageRoot: resolved, version: info.version, mtimeMs }
}

function collectDshPackages(root: string, maxDepth: number): RankedPackage[] {
  const found: RankedPackage[] = []

  const visit = (dir: string, depth: number): void => {
    if (depth > maxDepth) {
      return
    }

    const nested = locateAt(join(dir, 'node_modules', '@deepseek-ai', 'dsh'))
    if (nested) {
      found.push(nested)
    }

    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }

    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name === '.' || entry.name === '..') {
        continue
      }
      if (!entry.isDirectory() && !entry.isSymbolicLink()) {
        continue
      }
      visit(join(dir, entry.name), depth + 1)
    }
  }

  visit(root, 0)
  return found
}

function newest(packages: RankedPackage[]): LocatedDshPackage | null {
  if (packages.length === 0) {
    return null
  }

  packages.sort((left, right) => right.mtimeMs - left.mtimeMs)
  return { packageRoot: packages[0].packageRoot, version: packages[0].version }
}

export function findPnpmDlxCachedDsh(dlxRoot: string): LocatedDshPackage | null {
  let entries
  try {
    entries = readdirSync(dlxRoot, { withFileTypes: true })
  } catch {
    return null
  }

  const found: RankedPackage[] = []

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue
    }

    const hashDir = join(dlxRoot, entry.name)
    const viaPkg = locateAt(join(hashDir, 'pkg', 'node_modules', '@deepseek-ai', 'dsh'))
    if (viaPkg) {
      found.push(viaPkg)
      continue
    }

    found.push(...collectDshPackages(hashDir, 4))
  }

  return newest(found)
}

export function findNpxCachedDsh(npxRoot: string): LocatedDshPackage | null {
  return newest(collectDshPackages(npxRoot, 5))
}
