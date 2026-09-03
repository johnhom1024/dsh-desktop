import { deepEqual, equal, ok } from 'node:assert/strict'
import { test } from 'node:test'
import {
  checkUpdates,
  fetchGithubLatestRelease,
  isNewerVersion,
  mergeAppRelease,
  pickAppAsset,
  type GithubReleaseAsset,
  type GithubReleaseInfo,
} from './updates.js'

test('isNewerVersion treats a higher patch as an update', () => {
  equal(isNewerVersion('0.1.1', '0.1.0'), true)
  equal(isNewerVersion('0.1.0', '0.1.0'), false)
  equal(isNewerVersion('0.1.0', '0.1.1'), false)
})

test('isNewerVersion understands rc prereleases', () => {
  equal(isNewerVersion('0.1.0-rc.7', '0.1.0-rc.6'), true)
  equal(isNewerVersion('0.1.0', '0.1.0-rc.6'), true)
  equal(isNewerVersion('0.1.0-rc.6', '0.1.0'), false)
})

test('checkUpdates reports app and dsh updates from the registry', async () => {
  const report = await checkUpdates({
    appCurrent: '0.1.0',
    dshCurrent: '0.1.0-rc.6',
    fetchLatest: async (name) => {
      if (name === 'dsh-desktop') {
        return '0.2.0'
      }
      if (name === '@deepseek-ai/dsh') {
        return '0.1.0-rc.8'
      }
      return null
    },
  })

  deepEqual(report, {
    app: {
      name: 'dsh-desktop',
      current: '0.1.0',
      latest: '0.2.0',
      updateAvailable: true,
    },
    dsh: {
      name: '@deepseek-ai/dsh',
      current: '0.1.0-rc.6',
      latest: '0.1.0-rc.8',
      updateAvailable: true,
    },
  })
})

test('checkUpdates stays quiet when latest cannot be fetched', async () => {
  const report = await checkUpdates({
    appCurrent: '0.1.0',
    dshCurrent: null,
    fetchLatest: async () => null,
  })

  equal(report.app.updateAvailable, false)
  equal(report.app.latest, null)
  equal(report.dsh.current, null)
  equal(report.dsh.updateAvailable, false)
})

test('checkUpdates can inspect only the dsh package', async () => {
  const fetched: string[] = []
  const report = await checkUpdates({
    appCurrent: '0.1.0',
    dshCurrent: '0.1.0-rc.6',
    target: 'dsh',
    fetchLatest: async (name) => {
      fetched.push(name)
      return name === '@deepseek-ai/dsh' ? '0.1.0-rc.8' : '9.9.9'
    },
  })

  deepEqual(fetched, ['@deepseek-ai/dsh'])
  equal(report.app.latest, undefined)
  equal(report.dsh.latest, '0.1.0-rc.8')
  equal(report.dsh.updateAvailable, true)
})

test('checkUpdates can take a GitHub tag as the app latest version', async () => {
  const report = await checkUpdates({
    appCurrent: '0.1.0',
    dshCurrent: null,
    fetchLatest: async (name) => (name === 'dsh-desktop' ? '0.2.0' : null),
  })

  equal(report.app.updateAvailable, true)
  equal(report.app.latest, '0.2.0')
})

function asset(name: string, url: string): GithubReleaseAsset {
  return { name, browserDownloadUrl: url, size: 1, contentType: 'application/octet-stream' }
}

test('pickAppAsset returns the DMG that matches the requested arch', () => {
  const assets = [
    asset('dsh-desktop-0.2.0-arm64.dmg', 'https://example/arm64.dmg'),
    asset('dsh-desktop-0.2.0-x64.dmg', 'https://example/x64.dmg'),
    asset('SHA256SUMS-arm64.txt', 'https://example/sums.txt'),
  ]
  equal(pickAppAsset(assets, 'arm64')?.browserDownloadUrl, 'https://example/arm64.dmg')
  equal(pickAppAsset(assets, 'x64')?.browserDownloadUrl, 'https://example/x64.dmg')
})

test('pickAppAsset returns null when the requested arch is missing', () => {
  const assets = [asset('dsh-desktop-0.2.0-x64.dmg', 'https://example/x64.dmg')]
  equal(pickAppAsset(assets, 'arm64'), null)
})

test('pickAppAsset tolerates upper-case arch suffixes', () => {
  const assets = [asset('dsh-desktop-0.2.0-ARM64.dmg', 'https://example/arm64.dmg')]
  equal(pickAppAsset(assets, 'arm64')?.browserDownloadUrl, 'https://example/arm64.dmg')
})

test('mergeAppRelease fills download and release URLs when an update is available', () => {
  const base = {
    app: {
      name: 'dsh-desktop',
      current: '0.1.0',
      latest: '0.2.0',
      updateAvailable: true,
    },
    dsh: {
      name: '@deepseek-ai/dsh',
      current: null,
      latest: null,
      updateAvailable: false,
    },
  }
  const release: GithubReleaseInfo = {
    tag: '0.2.0',
    htmlUrl: 'https://github.com/johnhom1024/dsh-desktop/releases/tag/v0.2.0',
    assets: [
      asset('dsh-desktop-0.2.0-arm64.dmg', 'https://example/0.2.0-arm64.dmg'),
      asset('dsh-desktop-0.2.0-x64.dmg', 'https://example/0.2.0-x64.dmg'),
    ],
  }
  const merged = mergeAppRelease(base, release, 'arm64')
  equal(merged.app.downloadUrl, 'https://example/0.2.0-arm64.dmg')
  equal(merged.app.releaseUrl, 'https://github.com/johnhom1024/dsh-desktop/releases/tag/v0.2.0')
})

test('mergeAppRelease leaves URLs empty when not actually newer', () => {
  const base = {
    app: {
      name: 'dsh-desktop',
      current: '0.2.0',
      latest: '0.2.0',
      updateAvailable: false,
    },
    dsh: {
      name: '@deepseek-ai/dsh',
      current: null,
      latest: null,
      updateAvailable: false,
    },
  }
  const release: GithubReleaseInfo = {
    tag: '0.2.0',
    htmlUrl: 'https://github.com/x/y/releases/tag/v0.2.0',
    assets: [asset('dsh-desktop-0.2.0-arm64.dmg', 'https://example/0.2.0-arm64.dmg')],
  }
  const merged = mergeAppRelease(base, release, 'arm64')
  equal(merged.app.downloadUrl, null)
  equal(merged.app.releaseUrl, null)
})

test('mergeAppRelease still fills releaseUrl when the matching DMG is missing', () => {
  const base = {
    app: {
      name: 'dsh-desktop',
      current: '0.1.0',
      latest: '0.2.0',
      updateAvailable: true,
    },
    dsh: {
      name: '@deepseek-ai/dsh',
      current: null,
      latest: null,
      updateAvailable: false,
    },
  }
  const release: GithubReleaseInfo = {
    tag: '0.2.0',
    htmlUrl: 'https://github.com/x/y/releases/tag/v0.2.0',
    assets: [asset('dsh-desktop-0.2.0-x64.dmg', 'https://example/x64.dmg')],
  }
  const merged = mergeAppRelease(base, release, 'arm64')
  equal(merged.app.downloadUrl, null)
  equal(merged.app.releaseUrl, 'https://github.com/x/y/releases/tag/v0.2.0')
})

test('mergeAppRelease is a no-op when the release is null', () => {
  const base = {
    app: {
      name: 'dsh-desktop',
      current: '0.1.0',
      latest: '0.2.0',
      updateAvailable: true,
    },
    dsh: {
      name: '@deepseek-ai/dsh',
      current: null,
      latest: null,
      updateAvailable: false,
    },
  }
  const merged = mergeAppRelease(base, null, 'arm64')
  equal(merged.app.downloadUrl, undefined)
  equal(merged.app.releaseUrl, undefined)
})

test('fetchGithubLatestRelease parses the GitHub releases/latest payload', async () => {
  const original = globalThis.fetch
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        tag_name: 'v0.2.0',
        html_url: 'https://github.com/johnhom1024/dsh-desktop/releases/tag/v0.2.0',
        assets: [
          {
            name: 'dsh-desktop-0.2.0-arm64.dmg',
            browser_download_url: 'https://example/0.2.0-arm64.dmg',
            size: 1024,
            content_type: 'application/octet-stream',
          },
          {
            name: 'dsh-desktop-0.2.0-x64.dmg',
            browser_download_url: 'https://example/0.2.0-x64.dmg',
            size: 2048,
            content_type: 'application/octet-stream',
          },
        ],
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )) as unknown as typeof fetch
  try {
    const release = await fetchGithubLatestRelease('johnhom1024/dsh-desktop')
    ok(release, 'expected a release payload')
    equal(release?.tag, '0.2.0')
    equal(release?.htmlUrl, 'https://github.com/johnhom1024/dsh-desktop/releases/tag/v0.2.0')
    equal(release?.assets.length, 2)
    equal(release?.assets[0]?.name, 'dsh-desktop-0.2.0-arm64.dmg')
  } finally {
    globalThis.fetch = original
  }
})

test('fetchGithubLatestRelease returns null on a non-200 response', async () => {
  const original = globalThis.fetch
  globalThis.fetch = (async () =>
    new Response('forbidden', { status: 403 })) as unknown as typeof fetch
  try {
    equal(await fetchGithubLatestRelease('johnhom1024/dsh-desktop'), null)
  } finally {
    globalThis.fetch = original
  }
})
