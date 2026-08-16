import { deepEqual, equal } from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { isLoopbackHost, loadSettings, parseConnectTarget, saveSettings } from './settings.js'

const LOCAL_3080 = {
  id: 'local-3080',
  name: 'deepseek-harness',
  kind: 'local' as const,
  url: 'http://127.0.0.1:3080',
}

const DEFAULTS = {
  instances: [LOCAL_3080],
  activeInstanceId: 'local-3080',
  openAtLogin: false,
  autoStart: false,
  locale: 'system',
} as const

test('parseConnectTarget accepts a host and port', () => {
  deepEqual(parseConnectTarget({ host: ' 127.0.0.1 ', port: '3080' }), { host: '127.0.0.1', port: 3080 })
  equal(parseConnectTarget({ host: '', port: 3080 }), null)
  equal(isLoopbackHost('127.0.0.1'), true)
  equal(isLoopbackHost('192.168.31.229'), false)
})

test('loadSettings returns a default local instance when the file is missing', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-settings-'))

  deepEqual(loadSettings(dir), { ...DEFAULTS })
})

test('loadSettings migrates localPort into a local instance', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-settings-'))
  const { writeFile } = await import('node:fs/promises')
  await writeFile(
    join(dir, 'settings.json'),
    JSON.stringify({ connectionMode: 'smart', localPort: 18080, openAtLogin: false }),
    'utf8',
  )
  const loaded = loadSettings(dir)
  equal(loaded.instances.length, 1)
  equal(loaded.instances[0]?.kind, 'local')
  equal(loaded.instances[0]?.url, 'http://127.0.0.1:18080')
  equal(loaded.instances[0]?.id, 'local-18080')
  equal(loaded.instances[0]?.name, 'deepseek-harness')
  equal(loaded.activeInstanceId, loaded.instances[0]?.id)
})

test('loadSettings migrates remoteUrl into a second instance', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-settings-'))
  const { writeFile } = await import('node:fs/promises')
  await writeFile(
    join(dir, 'settings.json'),
    JSON.stringify({
      connectionMode: 'remote',
      localPort: 3080,
      remoteUrl: 'http://192.168.31.229:3080',
    }),
    'utf8',
  )
  const loaded = loadSettings(dir)
  equal(loaded.instances.length, 2)
  equal(loaded.instances[1]?.kind, 'remote')
  equal(loaded.instances[1]?.url, 'http://192.168.31.229:3080')
  equal(loaded.instances[1]?.id, 'remote-192.168.31.229-3080')
  equal(loaded.activeInstanceId, loaded.instances[1]?.id)
})

test('saveSettings then loadSettings round-trips a remote instance', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-settings-'))
  const remote = {
    id: 'remote-192.168.31.229-3080',
    name: '192.168.31.229:3080',
    kind: 'remote' as const,
    url: 'http://192.168.31.229:3080',
  }

  saveSettings(dir, {
    instances: [LOCAL_3080, remote],
    activeInstanceId: remote.id,
    openAtLogin: false,
  })

  deepEqual(loadSettings(dir), {
    ...DEFAULTS,
    instances: [LOCAL_3080, remote],
    activeInstanceId: remote.id,
  })
})

test('loadSettings falls back to defaults when json is invalid', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-settings-'))
  const { writeFile } = await import('node:fs/promises')
  await writeFile(join(dir, 'settings.json'), '{not-json', 'utf8')

  deepEqual(loadSettings(dir), { ...DEFAULTS })
})

test('saveSettings rejects a remote instance with a non-http url', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-settings-'))

  equal(
    saveSettings(dir, {
      instances: [LOCAL_3080, { id: 'r1', name: 'bad', kind: 'remote', url: 'file:///tmp' }],
      activeInstanceId: 'local-3080',
      openAtLogin: false,
    }),
    false,
  )
  deepEqual(loadSettings(dir), { ...DEFAULTS })
})

test('saveSettings rejects a non-http remote url from a legacy payload', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-settings-'))

  equal(
    saveSettings(dir, {
      connectionMode: 'remote',
      remoteUrl: 'file:///tmp/index.html',
    }),
    false,
  )
  deepEqual(loadSettings(dir), { ...DEFAULTS })
})

test('saveSettings then loadSettings round-trips a custom local port via legacy payload', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-settings-'))

  equal(
    saveSettings(dir, {
      connectionMode: 'smart',
      localPort: 18080,
    }),
    true,
  )

  const loaded = loadSettings(dir)
  equal(loaded.instances[0]?.url, 'http://127.0.0.1:18080')
  equal(loaded.instances[0]?.id, 'local-18080')
  equal(loaded.activeInstanceId, 'local-18080')
})

test('saveSettings rejects a local port outside 1-65535', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-settings-'))

  equal(
    saveSettings(dir, {
      connectionMode: 'smart',
      localPort: 70000,
    }),
    false,
  )
  deepEqual(loadSettings(dir), { ...DEFAULTS })
})

test('loadSettings ignores a non-integer local port in the file', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-settings-'))
  const { writeFile } = await import('node:fs/promises')
  await writeFile(
    join(dir, 'settings.json'),
    JSON.stringify({ connectionMode: 'smart', localPort: 'abc' }),
    'utf8',
  )

  deepEqual(loadSettings(dir), { ...DEFAULTS })
})

test('saveSettings accepts a numeric local port sent as a string', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-settings-'))

  equal(
    saveSettings(dir, {
      connectionMode: 'smart',
      localPort: '18080',
    }),
    true,
  )
  const loaded = loadSettings(dir)
  equal(loaded.instances[0]?.url, 'http://127.0.0.1:18080')
  equal(loaded.activeInstanceId, 'local-18080')
})

test('saveSettings then loadSettings round-trips autoStart', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-settings-'))

  equal(
    saveSettings(dir, {
      instances: [LOCAL_3080],
      activeInstanceId: 'local-3080',
      autoStart: true,
    }),
    true,
  )
  deepEqual(loadSettings(dir), { ...DEFAULTS, autoStart: true })
})

test('saveSettings then loadSettings round-trips openAtLogin', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-settings-'))

  equal(
    saveSettings(dir, {
      instances: [LOCAL_3080],
      activeInstanceId: 'local-3080',
      openAtLogin: true,
    }),
    true,
  )
  deepEqual(loadSettings(dir), { ...DEFAULTS, openAtLogin: true })
})

test('saveSettings then loadSettings round-trips locale', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-settings-'))

  equal(
    saveSettings(dir, {
      instances: [LOCAL_3080],
      activeInstanceId: 'local-3080',
      locale: 'en',
    }),
    true,
  )
  deepEqual(loadSettings(dir), { ...DEFAULTS, locale: 'en' })
})

test('saveSettings then loadSettings round-trips lastPackageManager and window bounds', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-settings-'))

  equal(
    saveSettings(dir, {
      instances: [LOCAL_3080],
      activeInstanceId: 'local-3080',
      lastPackageManager: 'pnpm',
      windowBounds: { x: 40, y: 60, width: 1400, height: 900 },
    }),
    true,
  )
  deepEqual(loadSettings(dir), {
    ...DEFAULTS,
    lastPackageManager: 'pnpm',
    windowBounds: { x: 40, y: 60, width: 1400, height: 900 },
  })
})

test('saveSettings then loadSettings keeps a renamed local tab', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-settings-'))

  equal(
    saveSettings(dir, {
      instances: [{ ...LOCAL_3080, name: '工作区' }],
      activeInstanceId: 'local-3080',
      openAtLogin: false,
    }),
    true,
  )
  equal(loadSettings(dir).instances[0]?.name, '工作区')
})

test('loadSettings remaps the legacy 本机 tab name to deepseek-harness', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-settings-'))
  const { writeFile } = await import('node:fs/promises')
  await writeFile(
    join(dir, 'settings.json'),
    JSON.stringify({
      instances: [{ id: 'local-3080', name: '本机 3080', kind: 'local', url: 'http://127.0.0.1:3080' }],
      activeInstanceId: 'local-3080',
      openAtLogin: false,
    }),
    'utf8',
  )

  equal(loadSettings(dir).instances[0]?.name, 'deepseek-harness')
})

test('loadSettings keeps a custom local tab name', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-settings-'))
  const { writeFile } = await import('node:fs/promises')
  await writeFile(
    join(dir, 'settings.json'),
    JSON.stringify({
      instances: [{ ...LOCAL_3080, name: '工作区' }],
      activeInstanceId: 'local-3080',
      openAtLogin: false,
    }),
    'utf8',
  )

  equal(loadSettings(dir).instances[0]?.name, '工作区')
})

test('saveSettings refuses an empty instance list', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-settings-'))

  equal(
    saveSettings(dir, {
      instances: [],
      activeInstanceId: 'gone',
      openAtLogin: false,
    }),
    false,
  )
  deepEqual(loadSettings(dir), { ...DEFAULTS })
})
