import { equal, match } from 'node:assert/strict'
import { test } from 'node:test'
import { loadHostPage, type HarnessElement } from './page-harness.js'

type View = {
  settings: { connectionMode: string; localPort: number; remoteUrl?: string; openAtLogin: boolean }
  sourceKind: string
  lastError: string | null
  appVersion: string
}

const UP_TO_DATE = {
  app: { name: 'dsh-app', current: '0.1.0', latest: '0.1.0', updateAvailable: false },
  dsh: { name: '@deepseek-ai/dsh', current: '2.0.0', latest: '2.0.0', updateAvailable: false },
}

function makeApi(overrides: Record<string, unknown> = {}) {
  const saved: unknown[] = []
  const calls: string[] = []
  const view: View = {
    settings: { connectionMode: 'smart', localPort: 3080, openAtLogin: true },
    sourceKind: 'path-dsh',
    lastError: null,
    appVersion: '0.1.0',
  }
  const api: Record<string, unknown> = {
    get: async () => {
      calls.push('get')
      return view
    },
    save: async (settings: unknown) => {
      saved.push(settings)
      return true
    },
    reconnect: async () => {
      calls.push('reconnect')
    },
    checkUpdates: async () => UP_TO_DATE,
    ...overrides,
  }
  return { api, saved, calls }
}

function loadSettings(api: Record<string, unknown>) {
  return loadHostPage({ file: 'settings.html', apiName: 'dshSettings', api })
}

async function flush() {
  await new Promise((resolve) => setImmediate(resolve))
  await new Promise((resolve) => setImmediate(resolve))
}

test('settings page loads the current settings into the form', async () => {
  const { api } = makeApi()
  const { document } = await loadSettings(api)

  equal(document.querySelector('#mode')?.value, 'smart')
  equal(document.querySelector('#localPort')?.value, '3080')
  equal(document.querySelector('#openAtLogin')?.checked, true)
  equal(document.querySelector('#source')?.textContent, 'path-dsh')
  match(document.querySelector('#updateStatus')?.textContent ?? '', /0\.1\.0/)
})

test('save persists the form values', async () => {
  const { api, saved } = makeApi()
  const { document } = await loadSettings(api)

  const localPort = document.querySelector('#localPort') as HarnessElement
  localPort.value = '9090'
  document.querySelector('#save')?.click()
  await flush()

  // The page script runs in a separate vm realm, so its object literals have a
  // different prototype; compare field by field instead of deepStrictEqual.
  const payload = saved[0] as {
    connectionMode: string
    localPort: number
    remoteUrl?: string
    openAtLogin: boolean
  }
  equal(payload.connectionMode, 'smart')
  equal(payload.localPort, 9090)
  equal(payload.remoteUrl, undefined)
  equal(payload.openAtLogin, true)
  equal(document.querySelector('#source')?.textContent, '已保存')
})

test('a rejected save shows the validation message', async () => {
  const { api, saved } = makeApi({
    save: async (settings: unknown) => {
      saved.push(settings)
      return false
    },
  })
  const { document } = await loadSettings(api)

  const localPort = document.querySelector('#localPort') as HarnessElement
  localPort.value = '99999'
  document.querySelector('#save')?.click()
  await flush()

  equal(saved.length, 1)
  equal(
    document.querySelector('#source')?.textContent,
    '端口必须是 1–65535，远程 URL 必须是 http 或 https',
  )
})

test('reconnect saves, reconnects, and refreshes the view', async () => {
  const { api, saved, calls } = makeApi()
  const { document } = await loadSettings(api)
  equal(calls.filter((call) => call === 'get').length, 1)

  document.querySelector('#reconnect')?.click()
  await flush()

  equal(saved.length, 1)
  match(calls.join(','), /reconnect/)
  equal(calls.filter((call) => call === 'get').length, 2)
})

test('check updates renders the report', async () => {
  const { api } = makeApi()
  const { document } = await loadSettings(api)

  document.querySelector('#checkUpdates')?.click()
  await flush()

  match(document.querySelector('#updateStatus')?.textContent ?? '', /当前已是最新/)
  match(document.querySelector('#updateStatus')?.textContent ?? '', /dsh-app 0\.1\.0 → 0\.1\.0/)
  match(document.querySelector('#updateStatus')?.textContent ?? '', /@deepseek-ai\/dsh 2\.0\.0 → 2\.0\.0/)
})

test('an available update is reported as 发现更新', async () => {
  const { api } = makeApi({
    checkUpdates: async () => ({
      app: { name: 'dsh-app', current: '0.1.0', latest: '0.2.0', updateAvailable: true },
      dsh: { name: '@deepseek-ai/dsh', current: '2.0.0', latest: '2.1.0', updateAvailable: true },
    }),
  })
  const { document } = await loadSettings(api)

  document.querySelector('#checkUpdates')?.click()
  await flush()

  match(document.querySelector('#updateStatus')?.textContent ?? '', /发现更新/)
})
