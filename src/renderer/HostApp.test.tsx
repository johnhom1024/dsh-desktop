import { describe, expect, test } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HostApp } from './HostApp'
import type { DshShellApi, ShellState } from './dsh-shell'

const managers = [
  {
    id: 'pnpm' as const,
    label: 'pnpm',
    commandPath: '/opt/homebrew/bin/pnpm',
    args: ['dlx', '@deepseek-ai/dsh', 'web', '--port', '0'],
    preview: 'pnpm dlx @deepseek-ai/dsh web --port 0',
  },
  {
    id: 'npm' as const,
    label: 'npm / npx',
    commandPath: '/usr/local/bin/npx',
    args: ['-y', '@deepseek-ai/dsh', 'web', '--port', '0'],
    preview: 'npx -y @deepseek-ai/dsh web --port 0',
  },
]

function shellState(overrides: Partial<ShellState> = {}): ShellState {
  return {
    detected: false,
    url: null,
    sourceKind: 'none',
    localPort: 18080,
    instances: [
      { id: 'local-18080', name: '本机 18080', kind: 'local', url: 'http://127.0.0.1:18080' },
    ],
    activeInstanceId: 'local-18080',
    managers,
    lastError: null,
    lastPackageManager: 'pnpm',
    settingsOpen: false,
    openAtLogin: false,
    appVersion: '0.1.0',
    dshVersion: '0.2.0',
    ...overrides,
  }
}

function makeApi(overrides: Partial<DshShellApi> = {}) {
  const installed: string[] = []
  const selected: string[] = []
  const api: DshShellApi = {
    getState: async () => shellState(),
    detect: async () => shellState(),
    install: async (id) => {
      installed.push(id)
      return shellState()
    },
    selectInstance: async (id) => {
      selected.push(id)
      return shellState({ activeInstanceId: id })
    },
    addInstance: async () => shellState(),
    updateInstance: async () => shellState(),
    removeInstance: async () => shellState(),
    openSettings: async () => undefined,
    closeSettings: async () => undefined,
    acquireOverlay: async () => undefined,
    releaseOverlay: async () => undefined,
    popupInstanceMenu: async () => null,
    saveHost: async () => true,
    checkUpdates: async () => ({
      app: { name: 'dsh-desktop', current: '0.1.0', latest: '0.1.0', updateAvailable: false },
      dsh: { name: '@deepseek-ai/dsh', current: '0.2.0', latest: '0.2.0', updateAvailable: false },
    }),
    openUserData: async () => undefined,
    setTheme: async () => undefined,
    onInstallLog: () => () => undefined,
    onState: () => () => undefined,
    onOpenSettings: () => () => undefined,
    onUpdatesResult: () => () => undefined,
    ...overrides,
  }
  return { api, installed, selected }
}

describe('HostApp', () => {
  test('lists package managers and checks the last used one', async () => {
    const { api, installed } = makeApi()
    render(<HostApp api={api} />)

    expect(await screen.findByLabelText('pnpm')).toBeChecked()
    expect(screen.getByText(/127\.0\.0\.1:18080/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '确认并启动' })).toBeEnabled()
    expect(installed).toEqual([])
  })

  test('confirming install calls the api with the selected manager', async () => {
    const user = userEvent.setup()
    const { api, installed } = makeApi()
    render(<HostApp api={api} />)

    await screen.findByLabelText('pnpm')
    await user.click(screen.getByLabelText('npm / npx'))
    await user.click(screen.getByRole('button', { name: '确认并启动' }))

    expect(installed).toEqual(['npm'])
    expect(
      await screen.findByText('选择一个命令后点确认。不会在你点之前执行任何安装。'),
    ).toBeInTheDocument()
  })

  test('shows the error message when a previous run failed', async () => {
    const { api } = makeApi({
      getState: async () => shellState({ lastError: '端口 3080 启动超时，请检查日志。' }),
    })
    render(<HostApp api={api} />)

    expect(await screen.findByText('端口 3080 启动超时，请检查日志。')).toBeInTheDocument()
    expect(screen.getByText('端口 3080 启动超时，请检查日志。')).toHaveClass('error')
  })

  test('opens settings as a host tab and hides multi-instance controls', async () => {
    const user = userEvent.setup()
    const opened: string[] = []
    const closed: string[] = []
    const { api } = makeApi({
      getState: async () =>
        shellState({
          detected: true,
          url: 'http://127.0.0.1:18080',
          sourceKind: 'reuse-local',
        }),
      openSettings: async () => {
        opened.push('open')
      },
      closeSettings: async () => {
        closed.push('close')
      },
    })
    render(<HostApp api={api} />)

    expect(await screen.findByRole('tab', { name: '本机 18080' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.queryByRole('button', { name: '新增实例' })).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: '连接设置' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: '设置' }))
    expect(opened).toEqual(['open'])
    expect(screen.getByRole('tab', { name: '设置' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('heading', { name: '设置' })).toBeInTheDocument()
    expect(screen.getByText('本机已运行的服务')).toBeInTheDocument()
    expect(screen.getByText('pnpm')).toBeInTheDocument()
    expect(screen.getByText('当前版本 0.1.0')).toBeInTheDocument()
    expect(screen.getByText('当前版本 0.2.0')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: '检查更新' })).toHaveLength(2)
    expect(screen.getByRole('button', { name: '打开目录' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '主题：跟随系统' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '主题：跟随系统' }))
    expect(screen.getByRole('button', { name: '主题：亮色' })).toBeInTheDocument()
    expect(screen.getByLabelText('登录时自动启动')).toBeInTheDocument()
    expect(screen.queryByText('新增远程')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '添加远程' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: '本机 18080' }))
    expect(closed).toEqual(['close'])
    expect(screen.queryByRole('heading', { name: '设置' })).not.toBeInTheDocument()
  })

  test('renames an instance tab from the overflow menu', async () => {
    const user = userEvent.setup()
    const overlays: string[] = []
    const { api } = makeApi({
      getState: async () =>
        shellState({
          detected: true,
          url: 'http://127.0.0.1:18080',
          sourceKind: 'reuse-local',
        }),
      acquireOverlay: async () => {
        overlays.push('acquire')
      },
      releaseOverlay: async () => {
        overlays.push('release')
      },
      popupInstanceMenu: async () => 'rename',
      updateInstance: async (input) =>
        shellState({
          detected: true,
          url: 'http://127.0.0.1:18080',
          sourceKind: 'reuse-local',
          instances: [{ id: input.id, name: input.name, kind: 'local', url: input.url }],
        }),
    })
    render(<HostApp api={api} />)

    expect(await screen.findByRole('tab', { name: '本机 18080' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '本机 18080 菜单' }))
    expect(overlays).toEqual(['acquire'])
    expect(screen.getByRole('dialog', { name: '重命名' })).toBeInTheDocument()

    const nameInput = screen.getByLabelText('名称')
    await user.clear(nameInput)
    await user.type(nameInput, '工作区')
    await user.click(screen.getByRole('button', { name: '确认' }))

    expect(await screen.findByRole('tab', { name: '工作区' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: '重命名' })).not.toBeInTheDocument()
    expect(overlays).toEqual(['acquire', 'release'])
  })
})
