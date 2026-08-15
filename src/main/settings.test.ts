import { deepEqual, equal } from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { loadSettings, saveSettings } from './settings.js'

const DEFAULTS = { connectionMode: 'smart', localPort: 3080, openAtLogin: false } as const

test('loadSettings returns smart mode when the file is missing', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-settings-'))

  deepEqual(loadSettings(dir), { ...DEFAULTS })
})

test('saveSettings then loadSettings round-trips a remote url', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-settings-'))

  saveSettings(dir, {
    connectionMode: 'remote',
    remoteUrl: 'http://192.168.31.229:3080',
  })

  deepEqual(loadSettings(dir), {
    ...DEFAULTS,
    connectionMode: 'remote',
    remoteUrl: 'http://192.168.31.229:3080',
  })
})

test('loadSettings falls back to defaults when json is invalid', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-settings-'))
  const { writeFile } = await import('node:fs/promises')
  await writeFile(join(dir, 'settings.json'), '{not-json', 'utf8')

  deepEqual(loadSettings(dir), { ...DEFAULTS })
})

test('saveSettings rejects a non-http remote url', async () => {
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

test('loadSettings defaults localPort to 3080', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-settings-'))

  deepEqual(loadSettings(dir), { ...DEFAULTS })
})

test('saveSettings then loadSettings round-trips a custom local port', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-settings-'))

  equal(
    saveSettings(dir, {
      connectionMode: 'smart',
      localPort: 18080,
    }),
    true,
  )

  deepEqual(loadSettings(dir), {
    ...DEFAULTS,
    localPort: 18080,
  })
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
  deepEqual(loadSettings(dir), { ...DEFAULTS, localPort: 18080 })
})

test('saveSettings then loadSettings round-trips openAtLogin', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-settings-'))

  equal(
    saveSettings(dir, {
      connectionMode: 'smart',
      openAtLogin: true,
    }),
    true,
  )
  deepEqual(loadSettings(dir), { ...DEFAULTS, openAtLogin: true })
})
