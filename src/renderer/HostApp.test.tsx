import { beforeEach, describe, expect, test } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { changeLanguage, ready } from '../i18n'
import { HostApp } from './HostApp'
import type { DshShellApi, ShellState, UpdateReport } from './dsh-shell'

const managers = [
  {
    id: 'pnpm' as const,
    label: 'pnpm',
    commandPath: '/opt/homebrew/bin/pnpm',
    args: ['dlx', '@deepseek-ai/dsh@latest', 'web', '--no-open', '--port', '3080'],
    preview: 'pnpm --config.dangerouslyAllowAllBuilds=true dlx @deepseek-ai/dsh@latest web --no-open --port 3080',
  },
  {
    id: 'npm' as const,
    label: 'npm / npx',
    commandPath: '/usr/local/bin/npx',
    args: ['-y', '@deepseek-ai/dsh@latest', 'web', '--no-open', '--port', '3080'],
    preview: 'npx -y @deepseek-ai/dsh@latest web --no-open --port 3080',
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
    sidebarCollapsed: false,
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
  const updateListeners: Array<(report: UpdateReport) => void> = []
  const opened: string[] = []
  const copied: string[] = []
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
    restart: async () => shellState({ detected: true, url: 'http://127.0.0.1:18080', sourceKind: 'reuse-local' }),
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
    setSidebarCollapsed: async () => undefined,
    openExternal: async (url) => {
      opened.push(url)
    },
    copyToClipboard: async (text) => {
      copied.push(text)
    },
    onInstallLog: () => () => undefined,
    onState: () => () => undefined,
    onOpenSettings: () => () => undefined,
    onUpdatesResult: (listener) => {
      updateListeners.push(listener)
      return () => {
        const index = updateListeners.indexOf(listener)
        if (index >= 0) {
          updateListeners.splice(index, 1)
        }
      }
    },
    ...overrides,
  }
  return {
    api,
    installed,
    savedPorts,
    selected,
    opened,
    copied,
    triggerUpdates: (report: UpdateReport) => {
      for (const listener of updateListeners) {
        listener(report)
      }
    },
  }
}

describe('HostApp', () => {
  beforeEach(async () => {
    await ready()
    await changeLanguage('zh-CN')
  })

  test('collapsed sidebar shows icons and keeps native instance menus accessible', async () => {
    const user = userEvent.setup()
    const menus: string[] = []
    const toggles: boolean[] = []
    const { api } = makeApi({
      getState: async () => shellState({ sidebarCollapsed: true }),
      popupInstanceMenu: async ({ instanceId }) => {
        menus.push(instanceId)
        return null
      },
      setSidebarCollapsed: async (value) => { toggles.push(value) },
    })
    render(<HostApp api={api} />)

    const tab = await screen.findByRole('tab', { name: 'deepseek-harness' })
    expect(tab.querySelector('svg')).toHaveClass('size-5')
    expect(tab.textContent).toBe('')
    expect(tab).toHaveAttribute('aria-selected', 'true')
    expect(screen.queryByRole('button', { name: 'deepseek-harness 菜单' })).not.toBeInTheDocument()
    await user.pointer({ target: tab, keys: '[MouseRight]' })
    expect(menus).toEqual(['local-18080'])
    tab.focus()
    await user.keyboard('{Shift>}{F10}{/Shift}')
    expect(menus).toEqual(['local-18080', 'local-18080'])

    const toggle = document.getElementById('sidebar-toggle')!
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(toggle.querySelector('svg')).toHaveClass('lucide-panel-left-open')
    await user.click(toggle)
    expect(toggles).toEqual([false])
    await user.click(screen.getByRole('tab', { name: '设置' }))
    expect(tab).toHaveAttribute('aria-selected', 'false')
    await user.click(tab)
    expect(tab).toHaveAttribute('aria-selected', 'true')
  })

  test('connection field sends the complete token URL and rejects credentials', async () => {
    const user = userEvent.setup()
    const inputs: unknown[] = []
    const { api } = makeApi({ detect: async (input) => { inputs.push(input); return shellState() } })
    render(<HostApp api={api} />)
    await user.click(await screen.findByRole('button', { name: '前往设置' }))
    const field = screen.getByLabelText('连接地址')
    const url = 'https://example.com/dsh/?token=a%2Bb%2Fc%3D&next=%2Fapp'
    await user.clear(field)
    await user.type(field, url)
    await user.click(screen.getByRole('button', { name: '连接' }))
    await user.click(screen.getByRole('button', { name: '重新检测' }))
    expect(inputs).toEqual([{ url }, { url }])
    await user.clear(field)
    await user.type(field, 'http://user:password@example.com')
    expect(screen.getByRole('button', { name: '连接' })).toBeDisabled()
    expect(field).toHaveAttribute('aria-invalid', 'true')
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
    expect(screen.getByLabelText('连接地址')).toHaveValue('http://127.0.0.1:18080')
    expect(screen.getByRole('button', { name: '连接' })).toBeEnabled()
    expect(screen.getByRole('button', { name: '重新检测' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: '启动服务' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '重新连接' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('启动端口')).toHaveValue('18080')
    expect(
      screen.getByText('pnpm --config.dangerouslyAllowAllBuilds=true dlx @deepseek-ai/dsh@latest web --no-open --port 18080'),
    ).toBeInTheDocument()
    const startPort = document.getElementById('startPort') as HTMLInputElement
    await user.clear(startPort)
    await user.type(startPort, '18081')
    expect(
      screen.getByText('pnpm --config.dangerouslyAllowAllBuilds=true dlx @deepseek-ai/dsh@latest web --no-open --port 18081'),
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
    sendLog?.('$ pnpm dlx @deepseek-ai/dsh@latest web --no-open --port 3080\nDownloading…\n')

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
    expect(screen.getByLabelText('连接地址')).toHaveValue('http://127.0.0.1:18080')
    expect(screen.queryByRole('button', { name: '终止服务' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '切换连接' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: 'deepseek-harness' }))
    expect(closed).toEqual(['close'])
    expect(screen.queryByRole('heading', { name: '设置' })).not.toBeInTheDocument()
  })

  test('restarts the local service from the connection card when connected', async () => {
    const user = userEvent.setup()
    const restarts: string[] = []
    const { api } = makeApi({
      getState: async () =>
        shellState({
          detected: true,
          url: 'http://127.0.0.1:18080',
          sourceKind: 'reuse-local',
        }),
      restart: async () => {
        restarts.push('restart')
        return shellState({
          detected: true,
          url: 'http://127.0.0.1:18080',
          sourceKind: 'reuse-local',
        })
      },
    })
    render(<HostApp api={api} />)

    await user.click(await screen.findByRole('tab', { name: '设置' }))
    expect(screen.getByText('已连接')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '重启服务' })).toBeEnabled()
    expect(screen.getByRole('button', { name: '终止服务' })).toBeEnabled()

    await user.click(screen.getByRole('button', { name: '重启服务' }))
    expect(restarts).toEqual(['restart'])
    // Once the restarted service is ready, the settings page closes automatically.
    expect(await screen.findByRole('tab', { name: 'deepseek-harness' })).toHaveAttribute('aria-selected', 'true')
  })

  test('hides restart for a remote connection', async () => {
    const user = userEvent.setup()
    const restarts: string[] = []
    const { api } = makeApi({
      getState: async () =>
        shellState({
          detected: true,
          url: 'http://192.168.31.229:3080',
          sourceKind: 'remote',
          instances: [
            { id: 'local-18080', name: 'deepseek-harness', kind: 'local', url: 'http://127.0.0.1:18080' },
            { id: 'remote-1', name: 'NAS', kind: 'remote', url: 'http://192.168.31.229:3080' },
          ],
          activeInstanceId: 'remote-1',
        }),
      restart: async () => {
        restarts.push('restart')
        return shellState()
      },
    })
    render(<HostApp api={api} />)

    await user.click(await screen.findByRole('tab', { name: '设置' }))
    expect(screen.getByText('远程服务')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '重启服务' })).not.toBeInTheDocument()
    expect(restarts).toEqual([])
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

  test('announces an app update with copy and open-release actions', async () => {
    const user = userEvent.setup()
    const { api, triggerUpdates, opened, copied } = makeApi()
    render(<HostApp api={api} />)
    await screen.findByText('当前没有启动服务')

    triggerUpdates({
      app: {
        name: 'dsh-desktop',
        current: '0.1.0',
        latest: '0.1.1',
        updateAvailable: true,
        downloadUrl: 'https://example.com/dsh-desktop-0.1.1-arm64.dmg',
        releaseUrl: 'https://github.com/johnhom1024/dsh-desktop/releases/tag/v0.1.1',
      },
      dsh: { name: '@deepseek-ai/dsh', current: '0.1.0', latest: '0.1.0', updateAvailable: false },
    })

    expect(await screen.findByText('dsh-desktop 有新版本')).toBeInTheDocument()
    expect(screen.getByText('v0.1.1 已发布。需要手动下载新安装包。')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '打开 Release 页面' }))
    expect(opened).toEqual(['https://github.com/johnhom1024/dsh-desktop/releases/tag/v0.1.1'])
    expect(screen.queryByText('dsh-desktop 有新版本')).not.toBeInTheDocument()
  })

  test('copy-download action writes the URL to the clipboard and shows a confirmation toast', async () => {
    const user = userEvent.setup()
    const { api, triggerUpdates, copied } = makeApi()
    render(<HostApp api={api} />)
    await screen.findByText('当前没有启动服务')

    triggerUpdates({
      app: {
        name: 'dsh-desktop',
        current: '0.1.0',
        latest: '0.1.1',
        updateAvailable: true,
        downloadUrl: 'https://example.com/dsh-desktop-0.1.1-arm64.dmg',
        releaseUrl: 'https://github.com/johnhom1024/dsh-desktop/releases/tag/v0.1.1',
      },
      dsh: { name: '@deepseek-ai/dsh', current: '0.1.0', latest: '0.1.0', updateAvailable: false },
    })

    await user.click(await screen.findByRole('button', { name: '复制下载链接' }))

    expect(copied).toEqual(['https://example.com/dsh-desktop-0.1.1-arm64.dmg'])
    expect(await screen.findByText('下载链接已复制到剪贴板。')).toBeInTheDocument()
    expect(screen.queryByText('dsh-desktop 有新版本')).not.toBeInTheDocument()
  })

  test('does not re-announce the same app version within a session', async () => {
    const { api, triggerUpdates } = makeApi()
    render(<HostApp api={api} />)
    await screen.findByText('当前没有启动服务')

    const report: UpdateReport = {
      app: {
        name: 'dsh-desktop',
        current: '0.1.0',
        latest: '0.1.1',
        updateAvailable: true,
        downloadUrl: 'https://example.com/dsh-desktop-0.1.1-arm64.dmg',
        releaseUrl: 'https://github.com/johnhom1024/dsh-desktop/releases/tag/v0.1.1',
      },
      dsh: { name: '@deepseek-ai/dsh', current: '0.1.0', latest: '0.1.0', updateAvailable: false },
    }

    triggerUpdates(report)
    expect(await screen.findByText('dsh-desktop 有新版本')).toBeInTheDocument()

    triggerUpdates(report)
    expect(screen.getAllByText('dsh-desktop 有新版本')).toHaveLength(1)
  })

  test('settings page exposes an open-release button alongside the existing update button', async () => {
    const user = userEvent.setup()
    const { api, triggerUpdates, opened } = makeApi()
    render(<HostApp api={api} />)

    // Wait for the initial mount effect to register the onUpdatesResult
    // listener, then push the update — otherwise the report arrives before
    // the renderer subscribed and is dropped.
    await screen.findByText('当前没有启动服务')
    triggerUpdates({
      app: {
        name: 'dsh-desktop',
        current: '0.1.0',
        latest: '0.1.1',
        updateAvailable: true,
        downloadUrl: 'https://example.com/dsh-desktop-0.1.1-arm64.dmg',
        releaseUrl: 'https://github.com/johnhom1024/dsh-desktop/releases/tag/v0.1.1',
      },
      dsh: { name: '@deepseek-ai/dsh', current: '0.1.0', latest: '0.1.0', updateAvailable: false },
    })

    await user.click(await screen.findByRole('button', { name: '前往设置' }))
    // The toast also carries the same label — grab the settings row's button
    // by its explicit id to avoid the accessibility-name collision.
    const openButton = document.getElementById('openAppRelease') as HTMLButtonElement
    expect(openButton).not.toBeNull()
    await user.click(openButton)
    expect(opened).toEqual(['https://github.com/johnhom1024/dsh-desktop/releases/tag/v0.1.1'])
  })
})
