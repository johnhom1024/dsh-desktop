import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import { DSH_PACKAGE_LATEST, PNPM_DLX_PREFIX, harnessWebArgs, userPnpmBin } from './package-managers.js'
import { DEFAULT_LOCAL_PORT, type RuntimeSource } from './runtime.js'

export type LaunchSpec =
  | { kind: 'url'; url: string }
  | { kind: 'spawn'; command: string; args: string[] }
  | { kind: 'none' }

export function whichOnPath(bin: string): string | null {
  if (bin === 'pnpm') {
    // Prefer the user's standalone pnpm home binary; PATH may expose a
    // corepack shim from another runtime whose version drifts per project.
    const override = userPnpmBin()
    if (override) {
      return override
    }
  }
  try {
    const found = execFileSync('which', [bin], { encoding: 'utf8' }).trim()
    return found || null
  } catch {
    return null
  }
}

function packageBin(packageRoot: string): string | null {
  try {
    const pkg = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')) as {
      bin?: string | Record<string, string>
    }
    const relative =
      typeof pkg.bin === 'string'
        ? pkg.bin
        : pkg.bin && typeof pkg.bin === 'object'
          ? pkg.bin.dsh
          : undefined
    if (!relative) {
      return null
    }
    const binPath = isAbsolute(relative) ? relative : join(packageRoot, relative)
    return binPath
  } catch {
    return null
  }
}

function nodeExecutable(lookup: (bin: string) => string | null): string | null {
  if (!('electron' in process.versions)) {
    return process.execPath
  }
  return lookup('node')
}

export function launchSpecFor(
  source: RuntimeSource,
  lookup: (bin: string) => string | null = whichOnPath,
  port: number = DEFAULT_LOCAL_PORT,
): LaunchSpec {
  if (source.kind === 'reuse-local' || source.kind === 'remote') {
    return { kind: 'url', url: source.url }
  }

  if (source.kind === 'path-dsh') {
    return { kind: 'spawn', command: source.command, args: harnessWebArgs([], port) }
  }

  if (source.kind === 'pnpm-dlx') {
    const pnpm = lookup('pnpm')
    if (!pnpm) {
      return { kind: 'none' }
    }
    return { kind: 'spawn', command: pnpm, args: harnessWebArgs([...PNPM_DLX_PREFIX], port) }
  }

  if (source.kind === 'npx-cache') {
    const npx = lookup('npx')
    if (!npx) {
      return { kind: 'none' }
    }
    return { kind: 'spawn', command: npx, args: harnessWebArgs(['-y', DSH_PACKAGE_LATEST], port) }
  }

  if (source.kind === 'bundled') {
    const bin = packageBin(source.packageRoot)
    const node = nodeExecutable(lookup)
    if (!bin || !node) {
      return { kind: 'none' }
    }
    return { kind: 'spawn', command: node, args: harnessWebArgs([bin], port) }
  }

  return { kind: 'none' }
}
