import { readFileSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import type { RuntimeSource } from './runtime.js'

export type LaunchSpec =
  | { kind: 'url'; url: string }
  | { kind: 'spawn'; command: string; args: string[] }
  | { kind: 'none' }

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

export function launchSpecFor(source: RuntimeSource): LaunchSpec {
  if (source.kind === 'reuse-local' || source.kind === 'remote') {
    return { kind: 'url', url: source.url }
  }

  if (source.kind === 'path-dsh') {
    return { kind: 'spawn', command: source.command, args: ['web', '--port', '0'] }
  }

  if (source.kind === 'pnpm-dlx' || source.kind === 'npx-cache' || source.kind === 'bundled') {
    const bin = packageBin(source.packageRoot)
    if (!bin) {
      return { kind: 'none' }
    }
    return { kind: 'spawn', command: process.execPath, args: [bin, 'web', '--port', '0'] }
  }

  return { kind: 'none' }
}
