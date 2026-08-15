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
    args: ['dlx', '@deepseek-ai/dsh', 'web', '--port', '3080'],
    preview: 'pnpm --config.dangerouslyAllowAllBuilds=true dlx @deepseek-ai/dsh web --port 3080',
  },
  {
    id: 'npm' as const,
    label: 'npm / npx',
    commandPath: '/usr/local/bin/npx',
    args: ['-y', '@deepseek-ai/dsh', 'web', '--port', '3080'],
    preview: 'npx -y @deepseek-ai/dsh web --port 3080',
  },
]

function shellState(overrides: Partial<ShellState> = {}): ShellState {
  return {
    detected: false,
    url: null,
    sourceKind: 'none',
    localPort: 18080,
    instances: [
      { id: 'local-18080', name: 'deepseek-harness', kind: 'local', url: 'http://127.0.0.1:18080' },
    ],
    activeInstanceId: 'local-18080',
    managers,
    lastError: null,
    lastPackageManager: 'pnpm',
    starting: false,
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
    stop: async () => shellState({ detected: false, url: null, sourceKind: 'none' }),
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
  test('shows an idle prompt on the instance tab instead of auto-running a command', async () => {
    const { api, installed } = makeApi({
      getState: async () => shellState({ lastPackageManager: null }),
    })
    render(<HostApp api={api} />)

    expect(await screen.findByText('当前没有启动服务')).toBeInTheDocument()
    expect(screen.getByText(/127\.0\.0\.1:18080/)).toBeInTheDocument()
    expect(screen.getByText(/首次使用请先去设置里选择启动命令并确认/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '前往设置' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '确认并启动' })).not.toBeInTheDocument()
    expect(installed).toEqual([])
  })

  test('settings lists package managers and confirming start calls the api', async () => {
    const user = userEvent.setup()
    const closed: string[] = []
    const { api, installed } = makeApi({
      getState: async () => shellState({ lastPackageManager: null }),
      closeSettings: async () => {
        closed.push('close')
      },
    })
    render(<HostApp api={api} />)

    await user.click(await screen.findByRole('button', { name: '前往设置' }))
    expect(await screen.findByLabelText('pnpm')).toBeChecked()
    expect(
      screen.getByText('pnpm --config.dangerouslyAllowAllBuilds=true dlx @deepseek-ai/dsh web --port 3080'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '确认并启动' })).toBeEnabled()

    await user.click(screen.getByLabelText('npm / npx'))
    await user.click(screen.getByRole('button', { name: '确认并启动' }))

    expect(installed).toEqual(['npm'])
    expect(closed).toEqual([])
    expect(await screen.findByRole('heading', { name: '设置' })).toBeInTheDocument()
    expect(screen.queryByText('当前没有启动服务')).not.toBeInTheDocument()
  })

  test('stays on settings with live logs while a manual start is in progress', async () => {
    const user = userEvent.setup()
    let sendLog: ((text: string) => void) | null = null
    let sendState: ((next: ShellState) => void) | null = null
    const { api } = makeApi({
      getState: async () => shellState({ lastPackageManager: null }),
      install: async () =>
        new Promise(() => {
          // Stay pending so the host can stream logs on the settings page.
        }),
      onInstallLog: (listener) => {
        sendLog = listener
        return () => undefined
      },
      onState: (listener) => {
        sendState = listener
        return () => undefined
      },
    })
    render(<HostApp api={api} />)

    await user.click(await screen.findByRole('button', { name: '前往设置' }))
    await user.click(await screen.findByRole('button', { name: '确认并启动' }))
    sendState?.(shellState({ starting: true, lastPackageManager: 'pnpm' }))
    sendLog?.('$ pnpm dlx @deepseek-ai/dsh web --port 3080\nDownloading…\n')

    expect(await screen.findByText('正在启动 DeepSeek Harness，日志会实时显示在下方。')).toBeInTheDocument()
    expect(screen.getByText(/Downloading…/)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '设置' })).toBeInTheDocument()
    expect(screen.queryByText('正在启动 DeepSeek Harness')).not.toBeInTheDocument()
  })

  test('shows a waiting animation while a background start is in progress', async () => {
    const { api } = makeApi({
      getState: async () => shellState({ starting: true }),
    })
    render(<HostApp api={api} />)

    expect(await screen.findByText('正在启动 DeepSeek Harness')).toBeInTheDocument()
    expect(screen.getByText(/等待 127\.0\.0\.1:18080 就绪后会自动打开官方页面。/)).toBeInTheDocument()
    expect(screen.queryByText('当前没有启动服务')).not.toBeInTheDocument()
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
      stop: async () =>
        shellState({
          detected: false,
          url: null,
          sourceKind: 'none',
        }),
    })
    render(<HostApp api={api} />)

    expect(await screen.findByRole('tab', { name: 'deepseek-harness' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.queryByRole('button', { name: '新增实例' })).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: '连接设置' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: '设置' }))
    expect(opened).toEqual(['open'])
    expect(screen.getByRole('tab', { name: '设置' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('heading', { name: '设置' })).toBeInTheDocument()
    expect(screen.getByText('本机已运行的服务')).toBeInTheDocument()
    expect(screen.getByText('已保存的启动命令')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '启动 DeepSeek Harness' })).toBeInTheDocument()
    expect(screen.getByText('服务已在运行。更换启动命令后点保存，下次会用新命令拉起。')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '终止服务' })).toBeEnabled()
    expect(screen.queryByText('已检测到 Web 页面，正在打开…')).not.toBeInTheDocument()
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

    await user.click(screen.getByRole('button', { name: '终止服务' }))
    expect(await screen.findByRole('button', { name: '终止服务' })).toBeDisabled()

    await user.click(screen.getByRole('tab', { name: 'deepseek-harness' }))
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

    expect(await screen.findByRole('tab', { name: 'deepseek-harness' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'deepseek-harness 菜单' }))
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
