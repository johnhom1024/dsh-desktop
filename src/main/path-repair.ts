import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const PATH_ASSIGN = /^(?:export\s+)?PATH=(["']?)([^"'#\n]+)\1\s*(?:#.*)?$/

export function candidatePathDirs(home: string): string[] {
  return [
    '/opt/homebrew/bin',
    '/usr/local/bin',
    join(home, 'Library', 'pnpm'),
    join(home, '.local', 'share', 'pnpm'),
  ]
}

export function extractPathAssignments(text: string, home: string): string[] {
  const found: string[] = []

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) {
      continue
    }

    const match = line.match(PATH_ASSIGN)
    if (!match) {
      continue
    }

    for (const part of match[2].split(':')) {
      const dir = part.replace(/\$\{?HOME\}?/g, home).replace(/\$\{?PATH\}?/g, '').trim()
      if (dir) {
        found.push(dir)
      }
    }
  }

  return found
}

export function mergePath(current: string | undefined, extras: string[]): string {
  const existing = (current ?? '').split(':').filter(Boolean)
  const seen = new Set(existing)
  const prefix: string[] = []

  for (const dir of extras) {
    if (!dir || seen.has(dir)) {
      continue
    }
    seen.add(dir)
    prefix.push(dir)
  }

  return [...prefix, ...existing].join(':')
}

export function extraPathDirs(home = homedir()): string[] {
  const extras = [...candidatePathDirs(home)]

  for (const name of ['.zprofile', '.zshrc', '.bash_profile', '.profile']) {
    const file = join(home, name)
    if (!existsSync(file)) {
      continue
    }
    try {
      extras.push(...extractPathAssignments(readFileSync(file, 'utf8'), home))
    } catch {
      // A unreadable profile must not block startup.
    }
  }

  return extras
}

export function repairProcessPath(): string {
  const next = mergePath(process.env.PATH, extraPathDirs())
  process.env.PATH = next
  return next
}
