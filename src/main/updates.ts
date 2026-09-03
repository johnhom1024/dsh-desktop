export type VersionCheck = {
  name: string
  current: string | null
  latest?: string | null
  updateAvailable: boolean
  /** Direct download URL for the matched asset (e.g. DMG). Null if not published. */
  downloadUrl?: string | null
  /** HTML URL of the release page, suitable for `openExternal`. */
  releaseUrl?: string | null
}

export type UpdateReport = {
  app: VersionCheck
  dsh: VersionCheck
}

export type GithubReleaseAsset = {
  name: string
  /** Direct browser download URL. */
  browserDownloadUrl: string
  size: number
  contentType: string
}

export type GithubReleaseInfo = {
  tag: string
  htmlUrl: string
  assets: GithubReleaseAsset[]
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

async function fetchJson(url: string, accept: string): Promise<unknown | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8000)
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { accept, 'user-agent': 'dsh-desktop' },
    })
    if (!response.ok) {
      return null
    }
    return (await response.json()) as unknown
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

export async function fetchGithubLatestTag(repo: string): Promise<string | null> {
  const body = (await fetchJson(
    `https://api.github.com/repos/${repo}/releases/latest`,
    'application/vnd.github+json',
  )) as { tag_name?: unknown } | null
  if (!body || typeof body.tag_name !== 'string') {
    return null
  }
  return body.tag_name.replace(/^v/, '')
}

export async function fetchGithubLatestRelease(repo: string): Promise<GithubReleaseInfo | null> {
  const body = (await fetchJson(
    `https://api.github.com/repos/${repo}/releases/latest`,
    'application/vnd.github+json',
  )) as
    | {
        tag_name?: unknown
        html_url?: unknown
        assets?: unknown
      }
    | null
  if (!body) {
    return null
  }
  if (typeof body.tag_name !== 'string' || typeof body.html_url !== 'string') {
    return null
  }
  const assets = Array.isArray(body.assets)
    ? body.assets
        .map((item): GithubReleaseAsset | null => {
          if (!item || typeof item !== 'object') {
            return null
          }
          const obj = item as Record<string, unknown>
          if (typeof obj.name !== 'string' || typeof obj.browser_download_url !== 'string') {
            return null
          }
          return {
            name: obj.name,
            browserDownloadUrl: obj.browser_download_url,
            size: typeof obj.size === 'number' ? obj.size : 0,
            contentType: typeof obj.content_type === 'string' ? obj.content_type : '',
          }
        })
        .filter((item): item is GithubReleaseAsset => item !== null)
    : []
  return {
    tag: body.tag_name.replace(/^v/, ''),
    htmlUrl: body.html_url,
    assets,
  }
}

const APP_ASSET_PATTERN = /^dsh-desktop-(.+)-(arm64|x64)\.dmg$/i

/**
 * Pick the DMG asset matching the current architecture. Only the explicit
 * architecture is considered — never fall back to the other one, because
 * downloading the wrong-arch DMG is a worse UX than showing a download link
 * to the release page.
 */
export function pickAppAsset(assets: GithubReleaseAsset[], arch: NodeJS.Architecture): GithubReleaseAsset | null {
  const target = arch === 'arm64' ? 'arm64' : 'x64'
  for (const asset of assets) {
    const match = asset.name.match(APP_ASSET_PATTERN)
    if (match && match[2].toLowerCase() === target) {
      return asset
    }
  }
  return null
}

/**
 * Augment an UpdateReport with direct download links when a release is known.
 * The download/release fields stay null when the release is missing, when no
 * asset matches the current arch, or when the version is not actually newer
 * than the installed one.
 */
export function mergeAppRelease(
  report: UpdateReport,
  release: GithubReleaseInfo | null,
  arch: NodeJS.Architecture,
): UpdateReport {
  if (!release) {
    return report
  }
  const asset = pickAppAsset(release.assets, arch)
  return {
    ...report,
    app: {
      ...report.app,
      latest: report.app.latest ?? release.tag,
      downloadUrl: report.app.updateAvailable && asset ? asset.browserDownloadUrl : null,
      releaseUrl: report.app.updateAvailable ? release.htmlUrl : null,
    },
  }
}

export async function fetchNpmLatestVersion(packageName: string): Promise<string | null> {
  const body = (await fetchJson(
    `https://registry.npmjs.org/${packageName}/latest`,
    'application/json',
  )) as { version?: unknown } | null
  if (!body || typeof body.version !== 'string') {
    return null
  }
  return body.version
}
