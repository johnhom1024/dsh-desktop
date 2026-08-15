import { Monitor, Moon, Settings, Sun } from 'lucide-react'
import { useEffect, useState } from 'react'
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

function versionStatus(check: VersionCheck | null, fallbackCurrent: string | null): string {
  const current = check?.current || fallbackCurrent
  if (!current) {
    return '当前版本未知'
  }
  if (!check || check.latest === undefined) {
    return `当前版本 ${current}`
  }
  if (!check.latest) {
    return `当前版本 ${current} · 未能获取最新版本`
  }
  if (check.updateAvailable) {
    return `当前版本 ${current} · 最新 ${check.latest}`
  }
  return `当前版本 ${current} · 已是最新`
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
  const [updateReport, setUpdateReport] = useState<UpdateReport | null>(null)
  const [checkingApp, setCheckingApp] = useState(false)
  const [checkingDsh, setCheckingDsh] = useState(false)
  const [theme, setTheme] = useState<ThemeMode>(() => readStoredTheme(window.localStorage))
  const [renaming, setRenaming] = useState<Instance | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [renameError, setRenameError] = useState('')

  function openSettingsPage() {
    setSettingsOpen(true)
    void api.openSettings()
  }

  function closeSettingsPage() {
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
    applyState(await api.updateInstance({ id: renaming.id, name, url: renaming.url }))
    closeRenameDialog()
  }

  function applyState(next: ShellState) {
    setState(next)
    setSelectedId((current) => pickManager(next, current))
    if (next.settingsOpen) {
      setSettingsOpen(true)
    }
    if (next.detected && next.url) {
      setStatus('已检测到 Web 页面，正在打开…')
      setStatusError(false)
      return
    }
    if (next.lastError) {
      setStatus(next.lastError)
      setStatusError(true)
    } else if (next.managers.length) {
      setStatus('选择一个命令后点确认。不会在你点之前执行任何安装。')
      setStatusError(false)
    } else {
      setStatus('未找到可用的包管理器。')
      setStatusError(true)
    }
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
    const stopLog = api.onInstallLog((text) => {
      setLog((current) => current + text)
    })
    const stopState = api.onState((next) => {
      applyState(next)
    })
    const stopOpen = api.onOpenSettings(() => {
      setSettingsOpen(true)
    })
    const stopUpdates = api.onUpdatesResult((report) => {
      setUpdateReport(report)
    })
    void run('正在检测本机环境…', () => api.getState())
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

  async function refreshUpdates(target: 'app' | 'dsh' | 'both') {
    if (target === 'app' || target === 'both') {
      setCheckingApp(true)
    }
    if (target === 'dsh' || target === 'both') {
      setCheckingDsh(true)
    }
    try {
      setUpdateReport(await api.checkUpdates())
    } finally {
      setCheckingApp(false)
      setCheckingDsh(false)
    }
  }

  const installDisabled = busy || !selectedId
  const port = state?.localPort || 3080
  const instances = visibleInstances(state)
  const instance = instances[0] ?? null
  const showSetup = !settingsOpen && !state?.detected
  const connected = Boolean(state?.detected && state.url)

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
                maxLength={40}
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
                <p className="mt-1 text-sm text-muted-foreground">查看当前实例的运行状态与来源。</p>
              </div>
              <div className="divide-y">
                <div className="grid gap-1 px-5 py-4 sm:grid-cols-[160px_1fr] sm:items-center">
                  <span className="text-sm text-muted-foreground">状态</span>
                  <span className="text-sm">{connected ? '已连接' : '未连接'}</span>
                </div>
                <div className="grid gap-1 px-5 py-4 sm:grid-cols-[160px_1fr] sm:items-center">
                  <span className="text-sm text-muted-foreground">名称</span>
                  <span className="text-sm">{instance?.name ?? '本机'}</span>
                </div>
                <div className="grid gap-1 px-5 py-4 sm:grid-cols-[160px_1fr] sm:items-center">
                  <span className="text-sm text-muted-foreground">地址</span>
                  <code className="font-mono text-sm">{state?.url ?? `http://127.0.0.1:${port}`}</code>
                </div>
                <div className="grid gap-1 px-5 py-4 sm:grid-cols-[160px_1fr] sm:items-center">
                  <span className="text-sm text-muted-foreground">运行时来源</span>
                  <span className="text-sm">{sourceLabel(state?.sourceKind ?? 'none')}</span>
                </div>
                <div className="grid gap-1 px-5 py-4 sm:grid-cols-[160px_1fr] sm:items-center">
                  <span className="text-sm text-muted-foreground">启动工具</span>
                  <span className="text-sm">{managerLabel(state?.lastPackageManager)}</span>
                </div>
                <div className="grid gap-1 px-5 py-4 sm:grid-cols-[160px_1fr] sm:items-center">
                  <Label htmlFor="localPort" className="text-sm font-normal text-muted-foreground">
                    端口
                  </Label>
                  <Input id="localPort" type="text" inputMode="numeric" value={String(port)} readOnly className="max-w-40" />
                </div>
                {state?.lastError ? (
                  <div className="grid gap-1 px-5 py-4 sm:grid-cols-[160px_1fr] sm:items-start">
                    <span className="text-sm text-muted-foreground">最近错误</span>
                    <span className="text-sm text-destructive">{state.lastError}</span>
                  </div>
                ) : null}
              </div>
              <div className="flex justify-end border-t px-5 py-3">
                <Button
                  id="reconnect"
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => {
                    void run('正在重新连接…', () => api.detect())
                  }}
                >
                  重新连接
                </Button>
              </div>
            </section>

            <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
              <div className="border-b px-5 py-4">
                <h2 className="text-sm font-medium">通用</h2>
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
            </section>

            <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
              <div className="border-b px-5 py-4">
                <h2 className="text-sm font-medium">更新</h2>
                <p className="mt-1 text-sm text-muted-foreground">分别检查应用与 DeepSeek Harness 的版本，不会自动安装。</p>
              </div>
              <div className="divide-y">
                <div className="flex items-center justify-between gap-6 px-5 py-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">dsh-desktop</p>
                    <p id="appUpdateStatus" className="mt-1 text-sm text-muted-foreground">
                      {versionStatus(updateReport?.app ?? null, state?.appVersion ?? null)}
                    </p>
                  </div>
                  <Button
                    id="checkAppUpdates"
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={checkingApp}
                    onClick={() => {
                      void refreshUpdates('app')
                    }}
                  >
                    {checkingApp ? '检查中…' : '检查更新'}
                  </Button>
                </div>
                <div className="flex items-center justify-between gap-6 px-5 py-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">DeepSeek Harness</p>
                    <p id="dshUpdateStatus" className="mt-1 text-sm text-muted-foreground">
                      {versionStatus(updateReport?.dsh ?? null, state?.dshVersion ?? null)}
                    </p>
                  </div>
                  <Button
                    id="checkDshUpdates"
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={checkingDsh}
                    onClick={() => {
                      void refreshUpdates('dsh')
                    }}
                  >
                    {checkingDsh ? '检查中…' : '检查更新'}
                  </Button>
                </div>
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

      {showSetup ? (
        <main id="setup" className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
          <Card>
            <CardHeader>
              <CardTitle className="text-xl">当前没有检测到 DeepSeek Harness</CardTitle>
              <CardDescription>
                本机 <code id="localHint" className="rounded bg-muted px-1 py-0.5 font-mono text-xs">127.0.0.1:{port}</code>{' '}
                现在不是官方 Web 页面。选择一个本机已有的包管理器，确认后会执行对应命令安装并启动；端口就绪后自动打开页面。
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div id="options">
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
                          <span className="block text-xs font-normal text-muted-foreground">{item.preview}</span>
                        </span>
                      </Label>
                    ))}
                  </RadioGroup>
                )}
              </div>
              <p id="status" className={cn('min-h-6 text-sm', statusError ? 'error text-destructive' : 'text-muted-foreground')}>
                {status}
              </p>
              {log ? (
                <pre id="log" className="max-h-52 overflow-auto whitespace-pre-wrap rounded-lg border bg-muted p-3 font-mono text-xs">
                  {log}
                </pre>
              ) : null}
            </CardContent>
            <CardFooter className="gap-2">
              <Button id="detect" type="button" variant="outline" disabled={busy} onClick={() => {
                void run('正在重新检测…', () => api.detect())
              }}>
                检测
              </Button>
              <Button
                id="install"
                type="button"
                disabled={installDisabled}
                onClick={() => {
                  if (!selectedId) {
                    return
                  }
                  void run('正在执行命令并等待端口就绪…', () => api.install(selectedId))
                }}
              >
                确认并启动
              </Button>
            </CardFooter>
          </Card>
        </main>
      ) : null}
    </div>
  )
}
