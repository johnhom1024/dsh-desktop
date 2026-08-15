import { deepEqual } from 'node:assert/strict'
import { test } from 'node:test'
import { defaultLocalInstance, resolveRuntime, type Settings } from './runtime.js'

const bundled = { packageRoot: '/app/node_modules/@deepseek-ai/dsh', version: '0.1.0' }
const pnpmDlx = { packageRoot: '/pnpm/dlx/dsh', version: '0.1.0-rc.6' }
const npxCache = { packageRoot: '/npx/dsh', version: '0.1.0' }

function settings(partial: Partial<Settings> = {}): Settings {
  const local = defaultLocalInstance()
  return {
    instances: [local],
    activeInstanceId: local.id,
    openAtLogin: false,
    ...partial,
  }
}

test('smart mode reuses local 3080 before path, pnpm dlx, npx, or bundled', async () => {
  const source = await resolveRuntime({
    settings: settings(),
    probe: async () => true,
    whichDsh: async () => '/usr/local/bin/dsh',
    findPnpmDlx: async () => pnpmDlx,
    findNpxCache: async () => npxCache,
    bundled,
  })

  deepEqual(source, { kind: 'reuse-local', url: 'http://127.0.0.1:3080' })
})

test('smart mode uses path dsh when 3080 is not official ui', async () => {
  const source = await resolveRuntime({
    settings: settings(),
    probe: async () => false,
    whichDsh: async () => '/usr/local/bin/dsh',
    findPnpmDlx: async () => pnpmDlx,
    findNpxCache: async () => npxCache,
    bundled,
  })

  deepEqual(source, { kind: 'path-dsh', command: '/usr/local/bin/dsh' })
})

test('smart mode prefers pnpm dlx over npx cache', async () => {
  const source = await resolveRuntime({
    settings: settings(),
    probe: async () => false,
    whichDsh: async () => null,
    findPnpmDlx: async () => pnpmDlx,
    findNpxCache: async () => npxCache,
    bundled,
  })

  deepEqual(source, {
    kind: 'pnpm-dlx',
    packageRoot: pnpmDlx.packageRoot,
    version: pnpmDlx.version,
  })
})

test('smart mode uses npx cache when pnpm dlx is missing', async () => {
  const source = await resolveRuntime({
    settings: settings(),
    probe: async () => false,
    whichDsh: async () => null,
    findPnpmDlx: async () => null,
    findNpxCache: async () => ({ packageRoot: '/npx/dsh', version: '0.1.0-rc.6' }),
    bundled,
  })

  deepEqual(source, {
    kind: 'npx-cache',
    packageRoot: '/npx/dsh',
    version: '0.1.0-rc.6',
  })
})

test('smart mode uses bundled package when cache is empty', async () => {
  const source = await resolveRuntime({
    settings: settings(),
    probe: async () => false,
    whichDsh: async () => null,
    findPnpmDlx: async () => null,
    findNpxCache: async () => null,
    bundled,
  })

  deepEqual(source, {
    kind: 'bundled',
    packageRoot: bundled.packageRoot,
    version: bundled.version,
  })
})

test('smart mode returns none when no runtime exists', async () => {
  const source = await resolveRuntime({
    settings: settings(),
    probe: async () => false,
    whichDsh: async () => null,
    findPnpmDlx: async () => null,
    findNpxCache: async () => null,
    bundled: null,
  })

  deepEqual(source, { kind: 'none' })
})

test('remote mode uses saved url and skips local discovery', async () => {
  const remote = {
    id: 'remote-192.168.31.229-3080',
    name: '192.168.31.229:3080',
    kind: 'remote' as const,
    url: 'http://192.168.31.229:3080',
  }
  const source = await resolveRuntime({
    settings: settings({
      instances: [defaultLocalInstance(), remote],
      activeInstanceId: remote.id,
    }),
    probe: async () => true,
    whichDsh: async () => '/usr/local/bin/dsh',
    findPnpmDlx: async () => pnpmDlx,
    findNpxCache: async () => npxCache,
    bundled,
  })

  deepEqual(source, { kind: 'remote', url: 'http://192.168.31.229:3080' })
})

test('remote mode stays remote even when the saved url is unreachable', async () => {
  const remote = {
    id: 'remote-192.168.31.229-3080',
    name: '192.168.31.229:3080',
    kind: 'remote' as const,
    url: 'http://192.168.31.229:3080',
  }
  const source = await resolveRuntime({
    settings: settings({
      instances: [defaultLocalInstance(), remote],
      activeInstanceId: remote.id,
    }),
    probe: async () => false,
    whichDsh: async () => '/usr/local/bin/dsh',
    findPnpmDlx: async () => pnpmDlx,
    findNpxCache: async () => npxCache,
    bundled,
  })

  deepEqual(source, { kind: 'remote', url: 'http://192.168.31.229:3080' })
})

test('a local active instance never returns a remote source', async () => {
  const remote = {
    id: 'remote-192.168.31.229-3080',
    name: '192.168.31.229:3080',
    kind: 'remote' as const,
    url: 'http://192.168.31.229:3080',
  }
  const local = defaultLocalInstance()
  const source = await resolveRuntime({
    settings: settings({
      instances: [local, remote],
      activeInstanceId: local.id,
    }),
    probe: async () => false,
    whichDsh: async () => null,
    findPnpmDlx: async () => null,
    findNpxCache: async () => null,
    bundled: null,
  })

  deepEqual(source, { kind: 'none' })
})

test('smart mode reuses the saved local port instead of 3080', async () => {
  const probed: string[] = []
  const source = await resolveRuntime({
    settings: settings({
      instances: [defaultLocalInstance(18080)],
      activeInstanceId: 'local-18080',
    }),
    probe: async (url) => {
      probed.push(url)
      return url === 'http://127.0.0.1:18080'
    },
    whichDsh: async () => '/usr/local/bin/dsh',
    findPnpmDlx: async () => pnpmDlx,
    findNpxCache: async () => npxCache,
    bundled,
  })

  deepEqual(probed, ['http://127.0.0.1:18080'])
  deepEqual(source, { kind: 'reuse-local', url: 'http://127.0.0.1:18080' })
})
