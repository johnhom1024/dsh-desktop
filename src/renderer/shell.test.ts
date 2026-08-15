import { deepEqual, equal, match } from 'node:assert/strict'
import { test } from 'node:test'
import { loadHostPage, type HarnessElement } from './page-harness.js'

const managers = [
  {
    id: 'pnpm',
    label: 'pnpm',
    commandPath: '/opt/homebrew/bin/pnpm',
    args: ['dlx', '@deepseek-ai/dsh', 'web', '--port', '0'],
    preview: 'pnpm dlx @deepseek-ai/dsh web --port 0',
  },
  {
    id: 'npm',
    label: 'npm / npx',
    commandPath: '/usr/local/bin/npx',
    args: ['-y', '@deepseek-ai/dsh', 'web', '--port', '0'],
    preview: 'npx -y @deepseek-ai/dsh web --port 0',
  },
]

function shellState(overrides: Record<string, unknown> = {}) {
  return {
    detected: false,
    url: null,
    sourceKind: 'none',
    localPort: 18080,
    managers,
    lastError: null,
    lastPackageManager: 'pnpm',
    ...overrides,
  }
}

function loadShell(api: Record<string, unknown>) {
  return loadHostPage({ file: 'shell.html', apiName: 'dshShell', api })
}

test('shell lists package managers and checks the last used one', async () => {
  const installed: string[] = []
  const { document } = await loadShell({
    getState: async () => shellState(),
    detect: async () => shellState(),
    install: async (id: string) => {
      installed.push(id)
      return shellState()
    },
    openSettings: async () => undefined,
    onInstallLog: () => () => undefined,
  })

  const radios = document.querySelectorAll('input[name="manager"]')
  deepEqual(
    radios.map((input) => input.value),
    ['pnpm', 'npm'],
  )
  equal(radios[0]?.checked, true)
  match(document.querySelector('#localHint')?.textContent ?? '', /127\.0\.0\.1:18080/)
  equal(installed.length, 0)
  equal(document.querySelector('#install')?.disabled, false)
})

test('confirming install calls the api with the selected manager', async () => {
  const installed: string[] = []
  const { document } = await loadShell({
    getState: async () => shellState(),
    detect: async () => shellState(),
    install: async (id: string) => {
      installed.push(id)
      return shellState()
    },
    openSettings: async () => undefined,
    onInstallLog: () => () => undefined,
  })

  const radios = document.querySelectorAll('input[name="manager"]')
  radios[1]?.dispatchEvent('change')
  equal(document.querySelector('#install')?.disabled, false)

  const installBtn = document.querySelector('#install') as HarnessElement
  installBtn.click()

  await new Promise((resolve) => setImmediate(resolve))
  await new Promise((resolve) => setImmediate(resolve))

  deepEqual(installed, ['npm'])
  equal(document.querySelector('#status')?.textContent, '选择一个命令后点确认。不会在你点之前执行任何安装。')
})

test('shell shows the error message when a previous run failed', async () => {
  const { document } = await loadShell({
    getState: async () =>
      shellState({ lastError: '端口 3080 启动超时，请检查日志。' }),
    detect: async () => shellState(),
    install: async () => shellState(),
    openSettings: async () => undefined,
    onInstallLog: () => () => undefined,
  })

  equal(
    document.querySelector('#status')?.textContent,
    '端口 3080 启动超时，请检查日志。',
  )
  equal(document.querySelector('#status')?.className, 'status error')
})
