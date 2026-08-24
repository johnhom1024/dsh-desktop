import { beforeEach, describe, expect, test } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { changeLanguage, ready } from '../i18n'
import { HostApp } from './HostApp'
import type { DshShellApi, ShellState } from './dsh-shell'

const managers = [
  {
    id: 'pnpm' as const,
    label: 'pnpm',
    commandPath: '/opt/homebrew/bin/pnpm',
    args: ['dlx', '@deepseek-ai/dsh', 'web', '--no-open', '--port', '3080'],
    preview: 'pnpm --config.dangerouslyAllowAllBuilds=true dlx @deepseek-ai/dsh web --no-open --port 3080',
  },
  {
    id: 'npm' as const,
    label: 'npm / npx',
    commandPath: '/usr/local/bin/npx',
    args: ['-y', '@deepseek-ai/dsh', 'web', '--no-open', '--port', '3080'],
    preview: 'npx -y @deepseek-ai/dsh web --no-open --port 3080',
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
    locale: 'zh-CN',
    lastPackageManager: 'pnpm',
    starting: false,
    settingsOpen: false,
    openAtLogin: false,
    autoStart: false,
    appVersion: '0.1.0',
    dshVersion: '0.2.0',
    ...overrides,
  }
}

function makeApi(overrides: Partial<DshShellApi> = {}) {
  const installed: Array<{ id: string; port?: number }> = []
  const savedPorts: number[] = []
  const selected: string[] = []
  const api: DshShellApi = {
    getState: async () => shellState(),
    detect: async () => shellState(),
    install: async (id, input) => {
      installed.push({ id, port: input?.localPort })
      return shellState()
    },
    updateDsh: async () => shellState(),
    saveLocalPort: async (input) => {
      savedPorts.push(input.localPort)
      return shellState({ localPort: input.localPort })
    },
    stop: async () => shellState({ detected: false, url: null, sourceKind: 'none' }),
    disconnect: async () => shellState({ detected: false, url: null, sourceKind: 'none' }),
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
    checkUpdates: async (target = 'both') => ({
      app:
        target === 'dsh'
          ? { name: 'dsh-desktop', current: '0.1.0', updateAvailable: false }
          : { name: 'dsh-desktop', current: '0.1.0', latest: '0.1.0', updateAvailable: false },
      dsh:
        target === 'app'
          ? { name: '@deepseek-ai/dsh', current: '0.2.0', updateAvailable: false }
          : { name: '@deepseek-ai/dsh', current: '0.2.0', latest: '0.2.0', updateAvailable: false },
    }),
    openUserData: async () => undefined,
    setTheme: async () => undefined,
    onInstallLog: () => () => undefined,
    onState: () => () => undefined,
    onOpenSettings: () => () => undefined,
    onUpdatesResult: () => () => undefined,
    ...overrides,
  }
  return { api, installed, savedPorts, selected }
}

describe('HostApp', () => {
  beforeEach(async () => {
    await ready()
    await changeLanguage('zh-CN')
  })

  test('shows an idle prompt on the instance tab instead of auto-running a command', async () => {
    const { api, installed } = makeApi({
      getState: async () => shellState({ lastPackageManager: null }),
    })
    render(<HostApp api={api} />)

    expect(await screen.findByText('当前没有启动服务')).toBeInTheDocument()
    expect(screen.getByText(/127\.0\.0\.1:18080/)).toBeInTheDocument()
    expect(screen.getByText(/首次使用请先去设置里选择启动命令并确认/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '前往设置' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '启动' })).not.toBeInTheDocument()
    expect(installed).toEqual([])
  })

  test('settings lists package managers and confirming start calls the api', async () => {
    const user = userEvent.setup()
    const closed: string[] = []
    const { api, installed, savedPorts } = makeApi({
      getState: async () => shellState({ lastPackageManager: null }),
      closeSettings: async () => {
        closed.push('close')
      },
    })
    render(<HostApp api={api} />)

    await user.click(await screen.findByRole('button', { name: '前往设置' }))
    expect(await screen.findByLabelText('pnpm')).toBeChecked()
    expect(screen.getByText('未连接')).toBeInTheDocument()
    expect(screen.getByLabelText('IP')).toHaveValue('127.0.0.1')
    expect(screen.getByLabelText('连接端口')).toHaveValue('18080')
    expect(screen.getByRole('button', { name: '连接' })).toBeEnabled()
    expect(screen.getByRole('button', { name: '重新检测' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: '启动服务' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '重新连接' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('启动端口')).toHaveValue('18080')
    expect(
      screen.getByText('pnpm --config.dangerouslyAllowAllBuilds=true dlx @deepseek-ai/dsh web --no-open --port 18080'),
    ).toBeInTheDocument()
    const startPort = document.getElementById('startPort') as HTMLInputElement
    await user.clear(startPort)
    await user.type(startPort, '18081')
    expect(
      screen.getByText('pnpm --config.dangerouslyAllowAllBuilds=true dlx @deepseek-ai/dsh web --no-open --port 18081'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '启动' })).toBeEnabled()
    expect(screen.getByRole('button', { name: '保存' })).toBeEnabled()
    expect(screen.getByLabelText('自动启动 DeepSeek Harness')).not.toBeChecked()

    await user.click(screen.getByRole('button', { name: '保存' }))
    expect(savedPorts).toEqual([18081])
    expect(installed).toEqual([])

    await user.click(screen.getByLabelText('npm / npx'))
    await user.click(screen.getByRole('button', { name: '启动' }))

    expect(installed).toEqual([{ id: 'npm', port: 18081 }])
    expect(closed).toEqual([])
    expect(await screen.findByRole('heading', { name: '设置' })).toBeInTheDocument()
    expect(screen.queryByText('当前没有启动服务')).not.toBeInTheDocument()
  })

  test('connect failure shows a toast instead of an error row', async () => {
    const user = userEvent.setup()
    const { api } = makeApi({
      getState: async () => shellState({ lastPackageManager: 'pnpm' }),
      detect: async () =>
        shellState({
          lastError: { code: 'error.notRunning', params: { url: 'http://127.0.0.1:18080' } },
        }),
    })
    render(<HostApp api={api} />)

    await user.click(await screen.findByRole('button', { name: '前往设置' }))
    await user.click(screen.getByRole('button', { name: '连接' }))

    expect(
      await screen.findByText('该端口没有检测到 DeepSeek Harness 服务，请在下方的启动设置中启动服务。'),
    ).toBeInTheDocument()
    expect(screen.queryByText('说明')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '启动服务' })).not.toBeInTheDocument()
  })

  test('stays on settings with live logs while a manual start is in progress', async () => {
    const user = userEvent.setup()
    let sendLog: ((text: string) => void) | undefined
    let sendState: ((next: ShellState) => void) | undefined
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
    await user.click(await screen.findByRole('button', { name: '启动' }))
    sendState?.(shellState({ starting: true, lastPackageManager: 'pnpm' }))
    sendLog?.('$ pnpm dlx @deepseek-ai/dsh web --no-open --port 3080\nDownloading…\n')

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
      getState: async () =>
        shellState({ lastError: { code: 'error.unknown', params: { message: '端口 3080 启动超时，请检查日志。' } } }),
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
      disconnect: async () =>
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
    expect(screen.getByRole('heading', { name: '启动 DeepSeek Harness' })).toBeInTheDocument()
    expect(screen.getByText('已连接')).toBeInTheDocument()
    expect(screen.getByText('http://127.0.0.1:18080')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '连接' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '切换连接' })).toBeEnabled()
    expect(screen.getByRole('button', { name: '重新检测' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: '保存' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('启动端口')).toHaveValue('18080')
    expect(screen.getByLabelText('自动启动 DeepSeek Harness')).not.toBeChecked()
    expect(screen.getByText('服务已在运行。更换启动命令后点保存，下次会用新命令拉起。')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '终止服务' })).toBeEnabled()
    expect(screen.queryByText('已检测到 Web 页面，正在打开…')).not.toBeInTheDocument()
    expect(screen.getByText('0.1.0')).toBeInTheDocument()
    expect(screen.getByText('0.2.0')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '检查更新' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: '更新' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '检查更新' }))
    expect(await screen.findAllByText('已是最新')).toHaveLength(2)
    expect(screen.queryByText('未能获取最新版本')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '打开目录' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '主题：跟随系统' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '主题：跟随系统' }))
    expect(screen.getByRole('button', { name: '主题：亮色' })).toBeInTheDocument()
    expect(screen.getByLabelText('登录时自动启动')).toBeInTheDocument()
    expect(screen.queryByText('新增远程')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '添加远程' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '切换连接' }))
    expect(await screen.findByRole('button', { name: '连接' })).toBeEnabled()
    expect(screen.getByText('未连接')).toBeInTheDocument()
    expect(screen.getByLabelText('IP')).toHaveValue('127.0.0.1')
    expect(screen.getByLabelText('连接端口')).toHaveValue('18080')
    expect(screen.queryByRole('button', { name: '终止服务' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '切换连接' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: 'deepseek-harness' }))
    expect(closed).toEqual(['close'])
    expect(screen.queryByRole('heading', { name: '设置' })).not.toBeInTheDocument()
  })

  test('updates dsh when a newer version is available', async () => {
    const user = userEvent.setup()
    const updates: string[] = []
    const { api } = makeApi({
      checkUpdates: async () => ({
        app: { name: 'dsh-desktop', current: '0.1.0', latest: '0.1.0', updateAvailable: false },
        dsh: { name: '@deepseek-ai/dsh', current: '0.2.0', latest: '0.3.0', updateAvailable: true },
      }),
      updateDsh: async () => {
        updates.push('updateDsh')
        return shellState()
      },
    })
    render(<HostApp api={api} />)

    await user.click(screen.getByRole('tab', { name: '设置' }))
    await user.click(screen.getByRole('button', { name: '检查更新' }))
    expect(await screen.findByText('可更新至 0.3.0')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '更新' }))
    expect(updates).toEqual(['updateDsh'])
    expect(await screen.findByRole('button', { name: '检查更新' })).toBeEnabled()
    expect(screen.getByRole('button', { name: '更新' })).toBeEnabled()
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
