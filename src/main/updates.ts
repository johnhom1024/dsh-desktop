export type VersionCheck = {
  name: string
  current: string | null
  latest?: string | null
  updateAvailable: boolean
}

export type UpdateReport = {
  app: VersionCheck
  dsh: VersionCheck
}

type SemVer = {
  major: number
  minor: number
  patch: number
  prerelease: Array<string | number>
}

function parseSemVer(value: string): SemVer | null {
  const match = value.trim().match(/^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/)
  if (!match) {
    return null
  }

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4]
      ? match[4].split('.').map((part) => (/^\d+$/.test(part) ? Number(part) : part))
      : [],
  }
}

function compareIdentifiers(left: string | number, right: string | number): number {
  const leftNumeric = typeof left === 'number'
  const rightNumeric = typeof right === 'number'
  if (leftNumeric && rightNumeric) {
    return left - right
  }
  if (leftNumeric !== rightNumeric) {
    return leftNumeric ? -1 : 1
  }
  return String(left).localeCompare(String(right))
}

export function isNewerVersion(candidate: string, current: string): boolean {
  const next = parseSemVer(candidate)
  const prev = parseSemVer(current)
  if (!next || !prev) {
    return false
  }

  if (next.major !== prev.major) {
    return next.major > prev.major
  }
  if (next.minor !== prev.minor) {
    return next.minor > prev.minor
  }
  if (next.patch !== prev.patch) {
    return next.patch > prev.patch
  }

  if (next.prerelease.length === 0) {
    return prev.prerelease.length > 0
  }
  if (prev.prerelease.length === 0) {
    return false
  }

  const length = Math.max(next.prerelease.length, prev.prerelease.length)
  for (let index = 0; index < length; index += 1) {
    if (index >= next.prerelease.length) {
      return false
    }
    if (index >= prev.prerelease.length) {
      return true
    }
    const delta = compareIdentifiers(next.prerelease[index], prev.prerelease[index])
    if (delta !== 0) {
      return delta > 0
    }
  }

  return false
}

export type UpdateTarget = 'app' | 'dsh' | 'both'

function versionCheck(name: string, current: string | null, latest?: string | null): VersionCheck {
  return {
    name,
    current,
    latest,
    updateAvailable: Boolean(latest && current && isNewerVersion(latest, current)),
  }
}

export async function checkUpdates(input: {
  appCurrent: string
  dshCurrent: string | null
  fetchLatest: (packageName: string) => Promise<string | null>
  target?: UpdateTarget
}): Promise<UpdateReport> {
  const target = input.target ?? 'both'
  const [appLatest, dshLatest] = await Promise.all([
    target === 'dsh' ? Promise.resolve(undefined) : input.fetchLatest('dsh-desktop'),
    target === 'app' ? Promise.resolve(undefined) : input.fetchLatest('@deepseek-ai/dsh'),
  ])

  return {
    app: versionCheck(
      'dsh-desktop',
      input.appCurrent,
      appLatest === undefined ? undefined : appLatest,
    ),
    dsh: versionCheck(
      '@deepseek-ai/dsh',
      input.dshCurrent,
      dshLatest === undefined ? undefined : dshLatest,
    ),
  }
}

export async function fetchGithubLatestTag(repo: string): Promise<string | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8000)

  try {
    const response = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
      signal: controller.signal,
      headers: { accept: 'application/vnd.github+json', 'user-agent': 'dsh-desktop' },
    })
    if (!response.ok) {
      return null
    }
    const body = (await response.json()) as { tag_name?: unknown }
    if (typeof body.tag_name !== 'string') {
      return null
    }
    return body.tag_name.replace(/^v/, '')
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

export async function fetchNpmLatestVersion(packageName: string): Promise<string | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8000)

  try {
    const response = await fetch(`https://registry.npmjs.org/${packageName}/latest`, {
      signal: controller.signal,
      headers: { accept: 'application/json' },
    })
    if (!response.ok) {
      return null
    }
    const body = (await response.json()) as { version?: unknown }
    return typeof body.version === 'string' ? body.version : null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}
