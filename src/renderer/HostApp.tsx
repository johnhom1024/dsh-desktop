import { LoaderCircle, Monitor, Moon, Settings, Sun } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
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
import {
  changeLanguage,
  formatHostError,
  isConnectFailure,
  resolveLocale,
  t as translate,
  type LocalePreference,
} from '../i18n'
import type { DshShellApi, Instance, PackageManagerId, ShellState, UpdateReport, VersionCheck } from './dsh-shell'
import { I18nProvider } from './i18n'
import { applyTheme, nextTheme, readStoredTheme, themeLabelKey, type ThemeMode } from './theme'

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

function versionLabel(check: VersionCheck | null, fallbackCurrent: string | null, unknownLabel: string): string {
  return check?.current || fallbackCurrent || unknownLabel
}

function versionHint(
  check: VersionCheck | null,
  labels: { latestFailed: string; available: (latest: string) => string; current: string },
): string | null {
  if (!check || check.latest === undefined) {
    return null
  }
  if (!check.latest) {
    return labels.latestFailed
  }
  if (check.updateAvailable) {
    return labels.available(check.latest)
  }
  return labels.current
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

function IdleDescription({ host, text }: { host: string; text: string }) {
  const index = text.indexOf(host)
  if (index < 0) {
    return text
  }
  return (
    <>
      {text.slice(0, index)}
      <code id="localHint" className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
        {host}
      </code>
      {text.slice(index + host.length)}
    </>
  )
}

function sourceKey(kind: string): string {
  switch (kind) {
    case 'reuse-local':
    case 'path-dsh':
    case 'pnpm-dlx':
    case 'npx-cache':
    case 'bundled':
    case 'remote':
    case 'none':
      return `source.${kind}`
    default:
      return 'source.none'
  }
}

export function HostApp({ api }: HostAppProps) {
  return (
    <I18nProvider>
      <HostAppInner api={api} />
    </I18nProvider>
  )
}

function HostAppInner({ api }: HostAppProps) {
  const { t } = useTranslation()
  const [state, setState] = useState<ShellState | null>(null)
  const [selectedId, setSelectedId] = useState<PackageManagerId | null>(null)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState(() => t('status.detecting'))
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
      setRenameError(t('rename.empty'))
      return
    }
    if (name.length > 20) {
      setRenameError(t('rename.tooLong'))
      return
    }
    await applyState(await api.updateInstance({ id: renaming.id, name, url: renaming.url }))
    closeRenameDialog()
  }

  async function applyState(next: ShellState) {
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
    await changeLanguage(resolveLocale(next.locale, navigator.language))
    if (next.starting) {
      if (!stayInSettingsWhileStartingRef.current) {
        closeSettingsPage()
      }
      setStatus(translate('status.startingWithLogs'))
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
      const message = formatHostError(next.lastError, translate)
      setStatus(message)
      setStatusError(true)
      const toastKey = `${next.lastError.code}:${JSON.stringify(next.lastError.params ?? {})}`
      if (isConnectFailure(next.lastError) && lastToastErrorRef.current !== toastKey) {
        lastToastErrorRef.current = toastKey
        showToast(translate('error.connectHint'))
      }
      return
    }
    lastToastErrorRef.current = null
    if (next.detected && next.url) {
      setStatus(translate('status.running'))
      setStatusError(false)
      return
    }
    if (next.lastPackageManager) {
      setStatus(translate('status.idleSaved'))
      setStatusError(false)
      return
    }
    if (next.managers.length) {
      setStatus(translate('status.chooseCommand'))
      setStatusError(false)
      return
    }
    setStatus(translate('status.noManagers'))
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
      await applyState(await fn())
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
      void applyState(next)
    })
    const stopOpen = api.onOpenSettings(() => {
      settingsOpenRef.current = true
      setSettingsOpen(true)
    })
    const stopUpdates = api.onUpdatesResult((report) => {
      setUpdateReport(report)
    })
    void api.getState().then((next) => applyState(next)).catch((error) => {
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

  if (!state && statusError && status === t('status.missingApi')) {
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
            aria-label={t('chrome.settingsAria')}
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
            <span>{t('common.settings')}</span>
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
          aria-label={t('chrome.themeAria', { label: t(themeLabelKey(theme)) })}
          title={t('chrome.themeAria', { label: t(themeLabelKey(theme)) })}
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
              <DialogTitle>{t('rename.title')}</DialogTitle>
              <DialogDescription>{t('rename.description')}</DialogDescription>
            </DialogHeader>
            <div className="grid gap-2 py-4">
              <Label htmlFor="instance-name">{t('common.name')}</Label>
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
                {t('common.cancel')}
              </Button>
              <Button type="submit">{t('common.confirm')}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {settingsOpen ? (
        <main id="settings-page" className="min-h-0 flex-1 overflow-auto">
          <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 py-8">
            <div>
              <h1 className="text-xl font-semibold tracking-tight">{t('settings.title')}</h1>
              <p className="mt-1 text-sm text-muted-foreground">{t('settings.subtitle')}</p>
            </div>

            <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
              <div className="border-b px-5 py-4">
                <h2 className="text-sm font-medium">{t('settings.connection')}</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {connected ? t('settings.connectionOn') : t('settings.connectionOff')}
                </p>
              </div>
              {connected ? (
                <>
                  <div className="divide-y">
                    <div className="grid gap-1 px-5 py-4 sm:grid-cols-[160px_1fr] sm:items-center">
                      <span className="text-sm text-muted-foreground">{t('common.status')}</span>
                      <span className="text-sm">{t('settings.connected')}</span>
                    </div>
                    <div className="grid gap-1 px-5 py-4 sm:grid-cols-[160px_1fr] sm:items-center">
                      <span className="text-sm text-muted-foreground">{t('settings.name')}</span>
                      <span className="text-sm">{instance?.name ?? 'deepseek-harness'}</span>
                    </div>
                    <div className="grid gap-1 px-5 py-4 sm:grid-cols-[160px_1fr] sm:items-center">
                      <span className="text-sm text-muted-foreground">{t('settings.address')}</span>
                      <code className="font-mono text-sm">{state?.url}</code>
                    </div>
                    <div className="grid gap-1 px-5 py-4 sm:grid-cols-[160px_1fr] sm:items-center">
                      <span className="text-sm text-muted-foreground">{t('settings.source')}</span>
                      <span className="text-sm">{t(sourceKey(state?.sourceKind ?? 'none'))}</span>
                    </div>
                    {state?.lastError ? (
                      <div className="grid gap-1 px-5 py-4 sm:grid-cols-[160px_1fr] sm:items-start">
                        <span className="text-sm text-muted-foreground">{t('settings.lastError')}</span>
                        <span className="text-sm text-destructive">{formatHostError(state.lastError, t)}</span>
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
                          setStatus(t('status.stalePreload'))
                          setStatusError(true)
                          return
                        }
                        void run(t('status.switching'), () => api.disconnect!())
                      }}
                    >
                      {t('settings.switchConnection')}
                    </Button>
                    <Button
                      id="detect"
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={busy || starting}
                      onClick={() => {
                        void run(t('status.detectingAgain'), () =>
                          api.detect({
                            host: hostFromUrl(state?.url, connectHost),
                            port: portFromUrl(state?.url, parsedPort ?? state?.localPort ?? 3080),
                          }),
                        )
                      }}
                    >
                      {t('settings.detect')}
                    </Button>
                    <Button
                      id="stop-service"
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={busy || typeof api.stop !== 'function'}
                      onClick={() => {
                        if (typeof api.stop !== 'function') {
                          setStatus(t('status.stalePreload'))
                          setStatusError(true)
                          return
                        }
                        void run(t('status.stopping'), () => api.stop!())
                      }}
                    >
                      {t('settings.stop')}
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <div className="divide-y">
                    <div className="grid gap-1 px-5 py-4 sm:grid-cols-[160px_1fr] sm:items-center">
                      <span className="text-sm text-muted-foreground">{t('common.status')}</span>
                      <span className="text-sm">{starting ? t('settings.starting') : t('settings.disconnected')}</span>
                    </div>
                    <div className="grid gap-1 px-5 py-4 sm:grid-cols-[160px_1fr] sm:items-center">
                      <span className="text-sm text-muted-foreground">{t('settings.address')}</span>
                      <div className="flex min-w-0 items-center justify-start gap-2">
                        <Input
                          id="connectHost"
                          type="text"
                          aria-label={t('common.ip')}
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
                          aria-label={t('settings.connectPort')}
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
                          setStatus(t('error.invalidTarget'))
                          setStatusError(true)
                          return
                        }
                        void run(t('status.detectingAgain'), () =>
                          api.detect({ host: connectHost.trim(), port: parsedConnectPort }),
                        )
                      }}
                    >
                      {t('settings.detect')}
                    </Button>
                    <Button
                      id="connect"
                      type="button"
                      size="sm"
                      disabled={connectDisabled}
                      onClick={() => {
                        if (!connectHost.trim() || parsedConnectPort === null) {
                          setStatus(t('error.invalidTarget'))
                          setStatusError(true)
                          return
                        }
                        void run(t('status.connecting'), () =>
                          api.detect({ host: connectHost.trim(), port: parsedConnectPort }),
                        )
                      }}
                    >
                      {busy ? t('common.connecting') : t('common.connect')}
                    </Button>
                  </div>
                </>
              )}
            </section>

            <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
              <div className="border-b px-5 py-4">
                <h2 className="text-sm font-medium">{t('settings.launchTitle')}</h2>
                <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">
                  {t('settings.launchHint', { host: `127.0.0.1:${port}` })}
                </p>
              </div>
              <div className="space-y-4 px-5 py-4">
                <div className="grid gap-1 sm:grid-cols-[160px_1fr] sm:items-center">
                  <Label htmlFor="startPort" className="text-sm font-normal text-muted-foreground">
                    {t('settings.startPort')}
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
                    {t('settings.noManagersFound')}
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
                        setStatus(t('error.invalidPort'))
                        setStatusError(true)
                        return
                      }
                      void run(t('status.savingPort'), () => api.saveLocalPort({ localPort: parsedPort }))
                    }}
                  >
                    {t('common.save')}
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
                        setStatus(t('error.invalidPort'))
                        setStatusError(true)
                      }
                      return
                    }
                    stayInSettingsWhileStartingRef.current = true
                    stickLogToBottomRef.current = true
                    setLog('')
                    void run(t('status.installing'), () =>
                      api.install(selectedId, { localPort: parsedPort }),
                    )
                  }}
                >
                  {starting ? t('common.starting') : t('common.start')}
                </Button>
              </div>
            </section>

            <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
              <div className="border-b px-5 py-4">
                <h2 className="text-sm font-medium">{t('settings.general')}</h2>
              </div>
              <div className="divide-y">
                <div className="flex items-center justify-between gap-6 px-5 py-4">
                  <div className="min-w-0">
                    <Label htmlFor="locale" className="text-sm font-medium">
                      {t('locale.label')}
                    </Label>
                    <p className="mt-1 text-sm text-muted-foreground">{t('locale.hint')}</p>
                  </div>
                  <select
                    id="locale"
                    className="h-9 rounded-md border bg-background px-3 text-sm"
                    aria-label={t('locale.label')}
                    value={state?.locale ?? 'system'}
                    onChange={(event) => {
                      const next = event.target.value as LocalePreference
                      void api.saveHost({ locale: next })
                    }}
                  >
                    <option value="system">{t('locale.system')}</option>
                    <option value="zh-CN">{t('locale.zh-CN')}</option>
                    <option value="en">{t('locale.en')}</option>
                  </select>
                </div>
                <div className="flex items-center justify-between gap-6 px-5 py-4">
                  <div className="min-w-0">
                    <Label htmlFor="autoStart" className="text-sm font-medium">
                      {t('settings.autoStart')}
                    </Label>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {t('settings.autoStartHint')}
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
                      {t('settings.openAtLogin')}
                    </Label>
                    <p className="mt-1 text-sm text-muted-foreground">{t('settings.openAtLoginHint')}</p>
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
                <h2 className="text-sm font-medium">{t('settings.updates')}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{t('settings.updatesHint')}</p>
              </div>
              <div className="divide-y">
                <div className="flex items-center justify-between gap-6 px-5 py-4">
                  <p className="text-sm font-medium">dsh-desktop</p>
                  <div className="flex min-w-0 items-center gap-3">
                    <p id="appUpdateStatus" className="text-right text-sm text-muted-foreground">
                      <span>
                        {versionLabel(updateReport?.app ?? null, state?.appVersion ?? null, t('updates.unknown'))}
                      </span>
                      {versionHint(updateReport?.app ?? null, {
                        latestFailed: t('updates.latestFailed'),
                        available: (latest) => t('updates.available', { latest }),
                        current: t('updates.current'),
                      }) ? (
                        <span className="mt-0.5 block text-xs">
                          {versionHint(updateReport?.app ?? null, {
                            latestFailed: t('updates.latestFailed'),
                            available: (latest) => t('updates.available', { latest }),
                            current: t('updates.current'),
                          })}
                        </span>
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
                        {t('common.update')}
                      </Button>
                    ) : null}
                  </div>
                </div>
                <div className="flex items-center justify-between gap-6 px-5 py-4">
                  <p className="text-sm font-medium">DeepSeek Harness</p>
                  <div className="flex min-w-0 items-center gap-3">
                    <p id="dshUpdateStatus" className="text-right text-sm text-muted-foreground">
                      <span>
                        {versionLabel(updateReport?.dsh ?? null, state?.dshVersion ?? null, t('updates.unknown'))}
                      </span>
                      {versionHint(updateReport?.dsh ?? null, {
                        latestFailed: t('updates.latestFailed'),
                        available: (latest) => t('updates.available', { latest }),
                        current: t('updates.current'),
                      }) ? (
                        <span className="mt-0.5 block text-xs">
                          {versionHint(updateReport?.dsh ?? null, {
                            latestFailed: t('updates.latestFailed'),
                            available: (latest) => t('updates.available', { latest }),
                            current: t('updates.current'),
                          })}
                        </span>
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
                        {t('common.update')}
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
                  {checkingApp || checkingDsh ? t('settings.checking') : t('settings.checkUpdates')}
                </Button>
              </div>
            </section>

            <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
              <div className="border-b px-5 py-4">
                <h2 className="text-sm font-medium">{t('settings.data')}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{t('settings.dataHint')}</p>
              </div>
              <div className="flex items-center justify-between gap-6 px-5 py-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{t('settings.appData')}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{t('settings.appDataHint')}</p>
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
                  {t('settings.openDirectory')}
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
            <p className="text-sm font-medium">{t('starting.title')}</p>
            <p className="text-sm text-muted-foreground">{t('starting.description', { port })}</p>
          </div>
        </main>
      ) : null}

      {showIdle ? (
        <main id="setup" className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center px-6">
          <Card className="w-full">
            <CardHeader>
              <CardTitle className="text-xl">{t('idle.title')}</CardTitle>
              <CardDescription>
                <IdleDescription host={`127.0.0.1:${port}`} text={t('idle.description', { host: `127.0.0.1:${port}` })} />
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
                {t('idle.openSettings')}
              </Button>
            </CardFooter>
          </Card>
        </main>
      ) : null}

      <Toaster toasts={toasts} onDismiss={dismissToast} />
    </div>
  )
}
