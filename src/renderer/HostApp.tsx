import { LoaderCircle, Monitor, Moon, Settings, Sun } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Switch } from '@/components/ui/switch'
import { Toaster, type ToastItem } from '@/components/ui/toast'
import { cn } from '@/lib/utils'
import { InstanceTab } from './InstanceTab'
import type { DshShellApi, Instance, PackageManagerId, ShellState, UpdateReport, VersionCheck } from './dsh-shell'
import { applyTheme, nextTheme, readStoredTheme, themeLabel, type ThemeMode } from './theme'

type HostAppProps = {
  api: DshShellApi
}

const SETTINGS_TAB_ID = 'settings'

function isPackageManagerId(value: string | null | undefined): value is PackageManagerId {
  return value === 'pnpm' || value === 'npm' || value === 'yarn' || value === 'bun'
}

function pickManager(state: ShellState, current: PackageManagerId | null): PackageManagerId | null {
  if (current && state.managers.some((item) => item.id === current)) {
    return current
  }
  if (
    isPackageManagerId(state.lastPackageManager) &&
    state.managers.some((item) => item.id === state.lastPackageManager)
  ) {
    return state.lastPackageManager
  }
  return state.managers[0]?.id ?? null
}

function managerLabel(id: string | null | undefined): string {
  switch (id) {
    case 'pnpm':
      return 'pnpm'
    case 'npm':
      return 'npm / npx'
    case 'yarn':
      return 'yarn'
    case 'bun':
      return 'bun'
    default:
      return '未记录'
  }
}

function versionLabel(check: VersionCheck | null, fallbackCurrent: string | null): string {
  return check?.current || fallbackCurrent || '未知'
}

function versionHint(check: VersionCheck | null): string | null {
  if (!check || check.latest === undefined) {
    return null
  }
  if (!check.latest) {
    return '未能获取最新版本'
  }
  if (check.updateAvailable) {
    return `可更新至 ${check.latest}`
  }
  return '已是最新'
}

function parsePortDraft(value: string): number | null {
  if (!/^\d+$/.test(value.trim())) {
    return null
  }
  const port = Number(value)
  return Number.isInteger(port) && port >= 1 && port <= 65535 ? port : null
}

function previewWithPort(preview: string, port: number): string {
  return preview.replace(/--port\s+\d+/, `--port ${port}`)
}

function isConnectFailure(error: string): boolean {
  return /没有运行 DeepSeek Harness|无法连接到/i.test(error)
}

function connectFailureHint(error: string): string {
  if (isConnectFailure(error)) {
    return '该端口没有检测到 DeepSeek Harness 服务，请在下方的启动设置中启动服务。'
  }
  return error
}

function hostFromUrl(url: string | null | undefined, fallback = '127.0.0.1'): string {
  if (!url) {
    return fallback
  }
  try {
    return new URL(url).hostname || fallback
  } catch {
    return fallback
  }
}

function portFromUrl(url: string | null | undefined, fallback = 3080): number {
  if (!url) {
    return fallback
  }
  try {
    const port = Number(new URL(url).port)
    return Number.isInteger(port) && port >= 1 && port <= 65535 ? port : fallback
  } catch {
    return fallback
  }
}

function sourceLabel(kind: string): string {
  switch (kind) {
    case 'reuse-local':
      return '本机已运行的服务'
    case 'path-dsh':
      return '系统已安装的 dsh'
    case 'pnpm-dlx':
      return 'pnpm 本地缓存'
    case 'npx-cache':
      return 'npm 本地缓存'
    case 'bundled':
      return '应用内置运行时'
    case 'remote':
      return '远程服务'
    default:
      return '未连接'
  }
}

export function HostApp({ api }: HostAppProps) {
  const [state, setState] = useState<ShellState | null>(null)
  const [selectedId, setSelectedId] = useState<PackageManagerId | null>(null)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('正在检测本机环境…')
  const [statusError, setStatusError] = useState(false)
  const [log, setLog] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const settingsOpenRef = useRef(false)
  const stayInSettingsWhileStartingRef = useRef(false)
  const [updateReport, setUpdateReport] = useState<UpdateReport | null>(null)
  const [checkingApp, setCheckingApp] = useState(false)
  const [checkingDsh, setCheckingDsh] = useState(false)
  const [theme, setTheme] = useState<ThemeMode>(() => readStoredTheme(window.localStorage))
  const [renaming, setRenaming] = useState<Instance | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [renameError, setRenameError] = useState('')
  const [portDraft, setPortDraft] = useState('3080')
  const [connectHost, setConnectHost] = useState('127.0.0.1')
  const [connectPort, setConnectPort] = useState('3080')
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const toastIdRef = useRef(0)
  const lastToastErrorRef = useRef<string | null>(null)
  const stateRef = useRef<ShellState | null>(null)
  const logRef = useRef<HTMLPreElement | null>(null)
  const stickLogToBottomRef = useRef(true)

  function showToast(description: string, title?: string) {
    toastIdRef.current += 1
    const id = toastIdRef.current
    setToasts((current) => [...current, title ? { id, title, description } : { id, description }])
  }

  function dismissToast(id: number) {
    setToasts((current) => current.filter((item) => item.id !== id))
  }

  function openSettingsPage() {
    settingsOpenRef.current = true
    setSettingsOpen(true)
    void api.openSettings()
  }

  function closeSettingsPage() {
    if (!settingsOpenRef.current) {
      return
    }
    settingsOpenRef.current = false
    setSettingsOpen(false)
    void api.closeSettings()
  }

  function visibleInstances(next: ShellState | null): Instance[] {
    if (!next) {
      return []
    }
    const locals = next.instances.filter((item) => item.kind === 'local')
    return locals.length > 0 ? locals.slice(0, 1) : next.instances.slice(0, 1)
  }

  function openRenameDialog(instance: Instance) {
    setRenaming(instance)
    setRenameValue(instance.name)
    setRenameError('')
    void api.acquireOverlay()
  }

  async function openInstanceMenu(instance: Instance) {
    const action = await api.popupInstanceMenu({ instanceId: instance.id })
    if (action === 'rename') {
      openRenameDialog(instance)
    }
  }

  function closeRenameDialog() {
    setRenaming(null)
    setRenameValue('')
    setRenameError('')
    void api.releaseOverlay()
  }

  async function confirmRename() {
    if (!renaming) {
      return
    }
    const name = renameValue.trim()
    if (!name) {
      setRenameError('名称不能为空')
      return
    }
    if (name.length > 20) {
      setRenameError('名称最多 20 个字')
      return
    }
    applyState(await api.updateInstance({ id: renaming.id, name, url: renaming.url }))
    closeRenameDialog()
  }

  function applyState(next: ShellState) {
    const current = stateRef.current
    setPortDraft((draft) => {
      if (!current || draft === String(current.localPort)) {
        return String(next.localPort || 3080)
      }
      return draft
    })
    setConnectHost((draft) => {
      if (current?.url && !next.url) {
        return hostFromUrl(current.url, draft)
      }
      const nextHost = hostFromUrl(next.url, '127.0.0.1')
      if (!current || draft === hostFromUrl(current.url, '127.0.0.1')) {
        return nextHost
      }
      return draft
    })
    setConnectPort((draft) => {
      if (current?.url && !next.url) {
        return String(portFromUrl(current.url, Number(draft) || next.localPort || 3080))
      }
      const nextPort = String(portFromUrl(next.url, next.localPort || 3080))
      if (!current || draft === String(portFromUrl(current.url, current.localPort || 3080))) {
        return nextPort
      }
      return draft
    })
    stateRef.current = next
    setState(next)
    setSelectedId((selected) => pickManager(next, selected))
    if (next.starting) {
      if (!stayInSettingsWhileStartingRef.current) {
        closeSettingsPage()
      }
      setStatus('正在启动 DeepSeek Harness，日志会实时显示在下方。')
      setStatusError(false)
      return
    }
    if (stayInSettingsWhileStartingRef.current) {
      stayInSettingsWhileStartingRef.current = false
      if (next.detected && next.url && !next.lastError) {
        closeSettingsPage()
      }
    }
    if (next.settingsOpen) {
      settingsOpenRef.current = true
      setSettingsOpen(true)
    }
    if (next.lastError) {
      setStatus(next.lastError)
      setStatusError(true)
      if (isConnectFailure(next.lastError) && lastToastErrorRef.current !== next.lastError) {
        lastToastErrorRef.current = next.lastError
        showToast(connectFailureHint(next.lastError))
      }
      return
    }
    lastToastErrorRef.current = null
    if (next.detected && next.url) {
      setStatus('服务已在运行。更换启动命令后点保存，下次会用新命令拉起。')
      setStatusError(false)
      return
    }
    if (next.lastPackageManager) {
      setStatus('当前没有运行中的服务。可在设置里重新启动。')
      setStatusError(false)
      return
    }
    if (next.managers.length) {
      setStatus('请先选择启动命令并确认。确认前不会执行任何安装。')
      setStatusError(false)
      return
    }
    setStatus('未找到可用的包管理器。')
    setStatusError(true)
  }

  async function run(label: string, fn: () => Promise<ShellState>) {
    if (busy) {
      return
    }
    setBusy(true)
    setStatus(label)
    setStatusError(false)
    try {
      applyState(await fn())
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error))
      setStatusError(true)
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    const el = logRef.current
    if (!el || !log) {
      return
    }
    if (stickLogToBottomRef.current) {
      el.scrollTop = el.scrollHeight
    }
  }, [log])

  useEffect(() => {
    const stopLog = api.onInstallLog((text) => {
      setLog((current) => current + text)
    })
    const stopState = api.onState((next) => {
      applyState(next)
    })
    const stopOpen = api.onOpenSettings(() => {
      settingsOpenRef.current = true
      setSettingsOpen(true)
    })
    const stopUpdates = api.onUpdatesResult((report) => {
      setUpdateReport(report)
    })
    void api.getState().then(applyState).catch((error) => {
      setStatus(error instanceof Error ? error.message : String(error))
      setStatusError(true)
    })
    return () => {
      stopLog()
      stopState()
      stopOpen()
      stopUpdates()
    }
  }, [api])

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const sync = () => {
      applyTheme(theme, document.documentElement, media.matches)
    }
    sync()
    try {
      window.localStorage.setItem('dsh-theme', theme)
    } catch {
      // Ignore quota / private-mode failures.
    }
    void api.setTheme(theme)
    media.addEventListener('change', sync)
    return () => {
      media.removeEventListener('change', sync)
    }
  }, [theme])

  async function refreshUpdates(target: 'app' | 'dsh' | 'both' = 'both') {
    if (target === 'app' || target === 'both') {
      setCheckingApp(true)
    }
    if (target === 'dsh' || target === 'both') {
      setCheckingDsh(true)
    }
    try {
      const report = await api.checkUpdates(target)
      setUpdateReport((current) => ({
        app: target === 'dsh' ? current?.app ?? report.app : report.app,
        dsh: target === 'app' ? current?.dsh ?? report.dsh : report.dsh,
      }))
    } finally {
      setCheckingApp(false)
      setCheckingDsh(false)
    }
  }

  const parsedPort = parsePortDraft(portDraft)
  const parsedConnectPort = parsePortDraft(connectPort)
  const starting = Boolean(state?.starting)
  const portDirty = parsedPort !== null && parsedPort !== (state?.localPort ?? 3080)
  const installDisabled = busy || starting || !selectedId || parsedPort === null
  const savePortDisabled = busy || starting || !portDirty
  const port = parsedPort ?? state?.localPort ?? 3080
  const connectDisabled = busy || starting || !connectHost.trim() || parsedConnectPort === null
  const instances = visibleInstances(state)
  const instance = instances[0] ?? null
  const connected = Boolean(state?.detected && state.url)
  const showBoot = !settingsOpen && !state
  const showIdle = !settingsOpen && Boolean(state) && !connected && !starting
  const showStarting = !settingsOpen && starting

  if (!state && statusError && status.includes('宿主接口')) {
    return <p className="p-6 text-sm text-destructive">{status}</p>
  }

  return (
    <div className="flex h-full flex-col bg-background text-foreground">
      <div id="chrome" className="flex h-11 shrink-0 items-center gap-2 border-b bg-muted/60 px-2">
        <div id="tabs" role="tablist" className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto">
          <button
            id="settings"
            type="button"
            role="tab"
            data-tab={SETTINGS_TAB_ID}
            aria-label="设置"
            aria-selected={settingsOpen}
            className={cn(
              'inline-flex h-8 items-center gap-2 rounded-lg border px-2.5 text-sm transition-colors',
              settingsOpen
                ? 'border-border bg-card text-foreground shadow-sm'
                : 'border-transparent text-muted-foreground hover:bg-foreground/10 hover:text-foreground',
            )}
            onClick={openSettingsPage}
          >
            <Settings className="size-3.5" aria-hidden="true" />
            <span>设置</span>
          </button>
          {instances.map((item) => (
            <InstanceTab
              key={item.id}
              instance={item}
              selected={!settingsOpen && item.id === instance?.id}
              href={item.id === state?.activeInstanceId && state.url ? state.url : item.url}
              onSelect={() => {
                closeSettingsPage()
                if (item.id !== state?.activeInstanceId) {
                  void api.selectInstance(item.id)
                }
              }}
              onMenu={(item) => {
                void openInstanceMenu(item)
              }}
            />
          ))}
        </div>
        <Button
          id="theme-toggle"
          type="button"
          variant="ghost"
          size="icon"
          className="relative z-10 shrink-0 text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
          aria-label={`主题：${themeLabel(theme)}`}
          title={`主题：${themeLabel(theme)}`}
          onClick={() => {
            setTheme((current) => nextTheme(current))
          }}
        >
          {theme === 'light' ? <Sun aria-hidden="true" /> : null}
          {theme === 'dark' ? <Moon aria-hidden="true" /> : null}
          {theme === 'system' ? <Monitor aria-hidden="true" /> : null}
        </Button>
      </div>

      <Dialog
        open={Boolean(renaming)}
        onOpenChange={(open) => {
          if (!open) {
            closeRenameDialog()
          }
        }}
      >
        <DialogContent className="max-w-md">
          <form
            onSubmit={(event) => {
              event.preventDefault()
              void confirmRename()
            }}
          >
            <DialogHeader>
              <DialogTitle>重命名</DialogTitle>
              <DialogDescription>修改当前实例在顶栏中显示的名称。</DialogDescription>
            </DialogHeader>
            <div className="grid gap-2 py-4">
              <Label htmlFor="instance-name">名称</Label>
              <Input
                id="instance-name"
                value={renameValue}
                autoFocus
                maxLength={20}
                onChange={(event) => {
                  setRenameValue(event.target.value)
                  if (renameError) {
                    setRenameError('')
                  }
                }}
              />
              {renameError ? <p className="text-sm text-destructive">{renameError}</p> : null}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeRenameDialog}>
                取消
              </Button>
              <Button type="submit">确认</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {settingsOpen ? (
        <main id="settings-page" className="min-h-0 flex-1 overflow-auto">
          <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 py-8">
            <div>
              <h1 className="text-xl font-semibold tracking-tight">设置</h1>
              <p className="mt-1 text-sm text-muted-foreground">管理本机 DeepSeek Harness 的连接与应用偏好。</p>
            </div>

            <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
              <div className="border-b px-5 py-4">
                <h2 className="text-sm font-medium">连接</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {connected ? '当前已连上 DeepSeek Harness。' : '还没有连上服务。填写地址后点连接。'}
                </p>
              </div>
              {connected ? (
                <>
                  <div className="divide-y">
                    <div className="grid gap-1 px-5 py-4 sm:grid-cols-[160px_1fr] sm:items-center">
                      <span className="text-sm text-muted-foreground">状态</span>
                      <span className="text-sm">已连接</span>
                    </div>
                    <div className="grid gap-1 px-5 py-4 sm:grid-cols-[160px_1fr] sm:items-center">
                      <span className="text-sm text-muted-foreground">名称</span>
                      <span className="text-sm">{instance?.name ?? 'deepseek-harness'}</span>
                    </div>
                    <div className="grid gap-1 px-5 py-4 sm:grid-cols-[160px_1fr] sm:items-center">
                      <span className="text-sm text-muted-foreground">地址</span>
                      <code className="font-mono text-sm">{state?.url}</code>
                    </div>
                    <div className="grid gap-1 px-5 py-4 sm:grid-cols-[160px_1fr] sm:items-center">
                      <span className="text-sm text-muted-foreground">运行时来源</span>
                      <span className="text-sm">{sourceLabel(state?.sourceKind ?? 'none')}</span>
                    </div>
                    {state?.lastError ? (
                      <div className="grid gap-1 px-5 py-4 sm:grid-cols-[160px_1fr] sm:items-start">
                        <span className="text-sm text-muted-foreground">最近错误</span>
                        <span className="text-sm text-destructive">{state.lastError}</span>
                      </div>
                    ) : null}
                  </div>
                  <div className="flex justify-end gap-2 border-t px-5 py-3">
                    <Button
                      id="switch-connection"
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={busy || starting || typeof api.disconnect !== 'function'}
                      onClick={() => {
                        if (typeof api.disconnect !== 'function') {
                          setStatus('当前运行的是旧预加载脚本，请完全退出后重新执行 pnpm dev。')
                          setStatusError(true)
                          return
                        }
                        void run('正在切换连接…', () => api.disconnect!())
                      }}
                    >
                      切换连接
                    </Button>
                    <Button
                      id="detect"
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={busy || starting}
                      onClick={() => {
                        void run('正在重新检测…', () =>
                          api.detect({
                            host: hostFromUrl(state?.url, connectHost),
                            port: portFromUrl(state?.url, parsedPort ?? state?.localPort ?? 3080),
                          }),
                        )
                      }}
                    >
                      重新检测
                    </Button>
                    <Button
                      id="stop-service"
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={busy || typeof api.stop !== 'function'}
                      onClick={() => {
                        if (typeof api.stop !== 'function') {
                          setStatus('当前运行的是旧预加载脚本，请完全退出后重新执行 pnpm dev。')
                          setStatusError(true)
                          return
                        }
                        void run('正在终止本机 DeepSeek Harness…', () => api.stop!())
                      }}
                    >
                      终止服务
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <div className="divide-y">
                    <div className="grid gap-1 px-5 py-4 sm:grid-cols-[160px_1fr] sm:items-center">
                      <span className="text-sm text-muted-foreground">状态</span>
                      <span className="text-sm">{starting ? '启动中' : '未连接'}</span>
                    </div>
                    <div className="grid gap-1 px-5 py-4 sm:grid-cols-[160px_1fr] sm:items-center">
                      <span className="text-sm text-muted-foreground">地址</span>
                      <div className="flex min-w-0 items-center justify-start gap-2">
                        <Input
                          id="connectHost"
                          type="text"
                          aria-label="IP"
                          placeholder="127.0.0.1"
                          value={connectHost}
                          className="w-40"
                          onChange={(event) => {
                            setConnectHost(event.target.value)
                          }}
                        />
                        <Input
                          id="connectPort"
                          type="text"
                          inputMode="numeric"
                          aria-label="连接端口"
                          placeholder="3080"
                          value={connectPort}
                          className="w-24"
                          onChange={(event) => {
                            setConnectPort(event.target.value)
                          }}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 border-t px-5 py-3">
                    <Button
                      id="detect"
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={connectDisabled}
                      onClick={() => {
                        if (!connectHost.trim() || parsedConnectPort === null) {
                          setStatus('请输入有效的 IP 和 1–65535 端口')
                          setStatusError(true)
                          return
                        }
                        void run('正在重新检测…', () =>
                          api.detect({ host: connectHost.trim(), port: parsedConnectPort }),
                        )
                      }}
                    >
                      重新检测
                    </Button>
                    <Button
                      id="connect"
                      type="button"
                      size="sm"
                      disabled={connectDisabled}
                      onClick={() => {
                        if (!connectHost.trim() || parsedConnectPort === null) {
                          setStatus('请输入有效的 IP 和 1–65535 端口')
                          setStatusError(true)
                          return
                        }
                        void run('正在连接…', () =>
                          api.detect({ host: connectHost.trim(), port: parsedConnectPort }),
                        )
                      }}
                    >
                      {busy ? '连接中…' : '连接'}
                    </Button>
                  </div>
                </>
              )}
            </section>

            <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
              <div className="border-b px-5 py-4">
                <h2 className="text-sm font-medium">启动 DeepSeek Harness</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  首次使用请选择本机已有的包管理器。确认后会写入配置。
                  <br />
                  打开下方「自动启动」后，下次打开应用才会用这条命令拉起{' '}
                  <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">127.0.0.1:{port}</code>
                  。
                </p>
              </div>
              <div className="space-y-4 px-5 py-4">
                <div className="grid gap-1 sm:grid-cols-[160px_1fr] sm:items-center">
                  <Label htmlFor="startPort" className="text-sm font-normal text-muted-foreground">
                    启动端口
                  </Label>
                  <Input
                    id="startPort"
                    type="text"
                    inputMode="numeric"
                    value={portDraft}
                    className="max-w-40"
                    onChange={(event) => {
                      setPortDraft(event.target.value)
                    }}
                  />
                </div>
                {!state || state.managers.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    没有在 PATH 里找到 pnpm、npx、yarn 或 bunx。请先安装其中一个。
                  </p>
                ) : (
                  <RadioGroup
                    value={selectedId ?? undefined}
                    onValueChange={(value) => {
                      if (isPackageManagerId(value)) {
                        setSelectedId(value)
                      }
                    }}
                    className="grid gap-2.5"
                  >
                    {state.managers.map((item) => (
                      <Label
                        key={item.id}
                        htmlFor={`manager-${item.id}`}
                        className="flex cursor-pointer items-start gap-3 rounded-lg border p-3"
                      >
                        <RadioGroupItem id={`manager-${item.id}`} value={item.id} aria-label={item.label} className="mt-0.5" />
                        <span className="min-w-0">
                          <span className="block font-medium text-foreground">{item.label}</span>
                          <span className="block text-xs font-normal text-muted-foreground">
                            {previewWithPort(item.preview, port)}
                          </span>
                        </span>
                      </Label>
                    ))}
                  </RadioGroup>
                )}
                <p id="status" className={cn('min-h-6 text-sm', statusError ? 'error text-destructive' : 'text-muted-foreground')}>
                  {status}
                </p>
                {log ? (
                  <pre
                    id="log"
                    ref={logRef}
                    className="max-h-52 overflow-auto whitespace-pre-wrap rounded-lg border bg-muted p-3 font-mono text-xs"
                    onScroll={(event) => {
                      const el = event.currentTarget
                      stickLogToBottomRef.current =
                        el.scrollHeight - el.scrollTop - el.clientHeight < 24
                    }}
                  >
                    {log}
                  </pre>
                ) : null}
              </div>
              <div className="flex justify-end gap-2 border-t px-5 py-3">
                {portDirty ? (
                  <Button
                    id="save-port"
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={savePortDisabled}
                    onClick={() => {
                      if (parsedPort === null) {
                        setStatus('端口必须是 1–65535 的整数')
                        setStatusError(true)
                        return
                      }
                      void run('正在保存启动端口…', () => api.saveLocalPort({ localPort: parsedPort }))
                    }}
                  >
                    保存
                  </Button>
                ) : null}
                <Button
                  id="install"
                  type="button"
                  size="sm"
                  disabled={installDisabled}
                  onClick={() => {
                    if (!selectedId || parsedPort === null) {
                      if (parsedPort === null) {
                        setStatus('端口必须是 1–65535 的整数')
                        setStatusError(true)
                      }
                      return
                    }
                    stayInSettingsWhileStartingRef.current = true
                    stickLogToBottomRef.current = true
                    setLog('')
                    void run('正在执行命令，启动日志会显示在下方…', () =>
                      api.install(selectedId, { localPort: parsedPort }),
                    )
                  }}
                >
                  {starting ? '启动中…' : '启动'}
                </Button>
              </div>
            </section>

            <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
              <div className="border-b px-5 py-4">
                <h2 className="text-sm font-medium">通用</h2>
              </div>
              <div className="divide-y">
                <div className="flex items-center justify-between gap-6 px-5 py-4">
                  <div className="min-w-0">
                    <Label htmlFor="autoStart" className="text-sm font-medium">
                      自动启动 DeepSeek Harness
                    </Label>
                    <p className="mt-1 text-sm text-muted-foreground">
                      打开应用后，若本机端口还没起来，就用已保存的命令拉起服务。默认关闭。
                    </p>
                  </div>
                  <Switch
                    id="autoStart"
                    checked={Boolean(state?.autoStart)}
                    onCheckedChange={(checked) => {
                      void api.saveHost({ autoStart: checked })
                    }}
                  />
                </div>
                <div className="flex items-center justify-between gap-6 px-5 py-4">
                  <div className="min-w-0">
                    <Label htmlFor="openAtLogin" className="text-sm font-medium">
                      登录时自动启动
                    </Label>
                    <p className="mt-1 text-sm text-muted-foreground">开机后自动启动本应用，并在后台保持运行。</p>
                  </div>
                  <Switch
                    id="openAtLogin"
                    checked={Boolean(state?.openAtLogin)}
                    onCheckedChange={(checked) => {
                      void api.saveHost({ openAtLogin: checked })
                    }}
                  />
                </div>
              </div>
            </section>

            <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
              <div className="border-b px-5 py-4">
                <h2 className="text-sm font-medium">更新</h2>
                <p className="mt-1 text-sm text-muted-foreground">只检查版本，不会自动安装。</p>
              </div>
              <div className="divide-y">
                <div className="flex items-center justify-between gap-6 px-5 py-4">
                  <p className="text-sm font-medium">dsh-desktop</p>
                  <div className="flex min-w-0 items-center gap-3">
                    <p id="appUpdateStatus" className="text-right text-sm text-muted-foreground">
                      <span>{versionLabel(updateReport?.app ?? null, state?.appVersion ?? null)}</span>
                      {versionHint(updateReport?.app ?? null) ? (
                        <span className="mt-0.5 block text-xs">{versionHint(updateReport?.app ?? null)}</span>
                      ) : null}
                    </p>
                    {updateReport?.app?.updateAvailable ? (
                      <Button
                        id="updateApp"
                        type="button"
                        size="sm"
                        onClick={() => {
                          void refreshUpdates('app')
                        }}
                      >
                        更新
                      </Button>
                    ) : null}
                  </div>
                </div>
                <div className="flex items-center justify-between gap-6 px-5 py-4">
                  <p className="text-sm font-medium">DeepSeek Harness</p>
                  <div className="flex min-w-0 items-center gap-3">
                    <p id="dshUpdateStatus" className="text-right text-sm text-muted-foreground">
                      <span>{versionLabel(updateReport?.dsh ?? null, state?.dshVersion ?? null)}</span>
                      {versionHint(updateReport?.dsh ?? null) ? (
                        <span className="mt-0.5 block text-xs">{versionHint(updateReport?.dsh ?? null)}</span>
                      ) : null}
                    </p>
                    {updateReport?.dsh?.updateAvailable ? (
                      <Button
                        id="updateDsh"
                        type="button"
                        size="sm"
                        onClick={() => {
                          void refreshUpdates('dsh')
                        }}
                      >
                        更新
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>
              <div className="flex justify-end border-t px-5 py-3">
                <Button
                  id="checkUpdates"
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={checkingApp || checkingDsh}
                  onClick={() => {
                    void refreshUpdates('both')
                  }}
                >
                  {checkingApp || checkingDsh ? '检查中…' : '检查更新'}
                </Button>
              </div>
            </section>

            <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
              <div className="border-b px-5 py-4">
                <h2 className="text-sm font-medium">数据</h2>
                <p className="mt-1 text-sm text-muted-foreground">日志与本地配置保存在应用数据目录中。</p>
              </div>
              <div className="flex items-center justify-between gap-6 px-5 py-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium">应用数据</p>
                  <p className="mt-1 text-sm text-muted-foreground">包含 settings.json、shell.log 和 web.log。</p>
                </div>
                <Button
                  id="openUserData"
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    void api.openUserData()
                  }}
                >
                  打开目录
                </Button>
              </div>
            </section>
          </div>
        </main>
      ) : null}

      {showBoot ? (
        <main id="boot" className="flex flex-1 flex-col items-center justify-center gap-4 px-6">
          <LoaderCircle className="size-8 animate-spin text-primary" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">{status}</p>
        </main>
      ) : null}

      {showStarting ? (
        <main id="starting" className="flex flex-1 flex-col items-center justify-center gap-4 px-6">
          <LoaderCircle className="size-8 animate-spin text-primary" aria-hidden="true" />
          <div className="space-y-1 text-center">
            <p className="text-sm font-medium">正在启动 DeepSeek Harness</p>
            <p className="text-sm text-muted-foreground">等待 127.0.0.1:{port} 就绪后会自动打开官方页面。</p>
          </div>
        </main>
      ) : null}

      {showIdle ? (
        <main id="setup" className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center px-6">
          <Card className="w-full">
            <CardHeader>
              <CardTitle className="text-xl">当前没有启动服务</CardTitle>
              <CardDescription>
                本机 <code id="localHint" className="rounded bg-muted px-1 py-0.5 font-mono text-xs">127.0.0.1:{port}</code>{' '}
                现在不是官方 Web 页面。首次使用请先去设置里选择启动命令并确认。
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className={cn('text-sm', statusError ? 'error text-destructive' : 'text-muted-foreground')}>{status}</p>
            </CardContent>
            <CardFooter>
              <Button
                id="open-settings-from-idle"
                type="button"
                onClick={openSettingsPage}
              >
                前往设置
              </Button>
            </CardFooter>
          </Card>
        </main>
      ) : null}

      <Toaster toasts={toasts} onDismiss={dismissToast} />
    </div>
  )
}
