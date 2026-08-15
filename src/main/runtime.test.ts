import { deepEqual } from 'node:assert/strict'
import { test } from 'node:test'
import { defaultLocalInstance, resolveRuntime, type Settings } from './runtime.js'

function settings(partial: Partial<Settings> = {}): Settings {
  const local = defaultLocalInstance()
  return {
    instances: [local],
    activeInstanceId: local.id,
    openAtLogin: false,
    ...partial,
  }
}

test('local mode reuses 3080 when the official ui is already up', async () => {
  const source = await resolveRuntime({
    settings: settings(),
    probe: async () => true,
  })

  deepEqual(source, { kind: 'reuse-local', url: 'http://127.0.0.1:3080' })
})

test('local mode does not auto-spawn when 3080 is down', async () => {
  const source = await resolveRuntime({
    settings: settings({ lastPackageManager: 'pnpm' }),
    probe: async () => false,
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
  })

  deepEqual(source, { kind: 'none' })
})

test('local mode reuses the saved local port instead of 3080', async () => {
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
  })

  deepEqual(probed, ['http://127.0.0.1:18080'])
  deepEqual(source, { kind: 'reuse-local', url: 'http://127.0.0.1:18080' })
})
