import { deepEqual, equal } from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { loadSettings, saveSettings } from './settings.js'

test('loadSettings returns smart mode when the file is missing', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-settings-'))

  deepEqual(loadSettings(dir), { connectionMode: 'smart' })
})

test('saveSettings then loadSettings round-trips a remote url', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-settings-'))

  saveSettings(dir, {
    connectionMode: 'remote',
    remoteUrl: 'http://192.168.31.229:3080',
  })

  deepEqual(loadSettings(dir), {
    connectionMode: 'remote',
    remoteUrl: 'http://192.168.31.229:3080',
  })
})

test('loadSettings falls back to defaults when json is invalid', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-settings-'))
  const { writeFile } = await import('node:fs/promises')
  await writeFile(join(dir, 'settings.json'), '{not-json', 'utf8')

  deepEqual(loadSettings(dir), { connectionMode: 'smart' })
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
  deepEqual(loadSettings(dir), { connectionMode: 'smart' })
})
