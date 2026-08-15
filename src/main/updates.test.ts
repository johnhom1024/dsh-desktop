import { deepEqual, equal } from 'node:assert/strict'
import { test } from 'node:test'
import { checkUpdates, isNewerVersion } from './updates.js'

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
      if (name === 'dsh-app') {
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
      name: 'dsh-app',
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
