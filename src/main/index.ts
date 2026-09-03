import { execFile } from 'node:child_process'
import { homedir } from 'node:os'
import { join } from 'node:path'
import {
  BrowserWindow,
  Menu,
  Tray,
  WebContentsView,
  app,
  clipboard,
  ipcMain,
  nativeImage,
  nativeTheme,
  shell,
  type MenuItemConstructorOptions,
  type WebContents,
} from 'electron'
import { findNpxCachedDsh, findPnpmDlxCachedDsh, readDshPackage } from './dsh-package.js'
import { parseDshVersionFromText, readCliDshVersion } from './dsh-version.js'
import { startHarnessWeb, stopListeningOnPort } from './harness-process.js'
import { appendHostLog, formatTrayStatus } from './host-state.js'
import { instanceExternalUrl, instanceMenuItems, type InstanceMenuAction } from './instance-menu.js'
import { removeInstance, renameInstance, selectInstance, setLocalPort, upsertInstance } from './instances.js'
import { layoutActiveView, shouldShowInstanceView, sidebarWidthFor } from './instance-views.js'
import { launchSpecFor } from './launch.js'
import {
  DSH_PACKAGE,
  detectPackageManagers,
  lookupOnPath,
  previewFor,
  type PackageManagerId,
  type PackageManagerOption,
} from './package-managers.js'
import { isHostPage } from './host-page.js'
import { hostShortcutFor, type HostShortcut } from './host-shortcuts.js'
import { repairProcessPath } from './path-repair.js'
import { preloadFile, rendererFile } from './paths.js'
import { probeHarnessWeb } from './probe.js'
import {
  activeInstance,
  localPortFromSettings,
  localWebUrl,
  resolveRuntime,
  type Instance,
  type RuntimeSource,
  type Settings,
} from './runtime.js'
import { isLoopbackHost, loadSettings, parseConnectTarget, parseLocalPort, saveSettings } from './settings.js'
import { bindSingleInstance } from './single-instance.js'
import { applyTrayMenu, createTray, hideInsteadOfClose, setTrayStatus } from './tray.js'
import {
  checkUpdates,
  fetchGithubLatestRelease,
  fetchGithubLatestTag,
  fetchNpmLatestVersion,
  mergeAppRelease,
  type UpdateReport,
  type UpdateTarget,
} from './updates.js'
import { applyDesktopIcon, attachWindowGuards, createMainWindow, loadHostUrl, loadShellPage } from './window.js'
import {
  changeLanguage,
  isLocalePreference,
  ready,
  resolveLocale,
  t,
  toHostError,
  type HostError,
  type LocalePreference,
} from '../i18n/index.js'

const GITHUB_REPO = process.env.DSH_DESKTOP_GITHUB_REPO ?? process.env.DSH_APP_GITHUB_REPO ?? ''
const WATCH_MS = 8_000

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let currentSource: RuntimeSource = { kind: 'none' }
let currentUrl: string | null = null
let lastError: HostError | null = null
let starting = false
let stopHarness: (() => Promise<void>) | null = null
let quitting = false
let watchTimer: ReturnType<typeof setInterval> | null = null
let boundsTimer: ReturnType<typeof setTimeout> | null = null
const instanceViews = new Map<string, WebContentsView>()
let overlayCount = 0
let hostDevToolsOpen = false

function userData(): string {
  return app.getPath('userData')
}

function logShell(text: string): void {
  appendHostLog(userData(), 'shell.log', text)
}

function logWeb(text: string): void {
  appendHostLog(userData(), 'web.log', text)
}

// Ring buffer of recent install/startup log output. The renderer may not have
// mounted (or even loaded) when early startup output arrives — especially on
// first autoStart — so keep the tail and replay it when the renderer asks.
const INSTALL_LOG_TAIL_LIMIT = 400
let installLogTail: string[] = []

function emitInstallLog(text: string): void {
  logWeb(text)
  installLogTail.push(text)
  if (installLogTail.length > INSTALL_LOG_TAIL_LIMIT) {
    installLogTail = installLogTail.slice(installLogTail.length - INSTALL_LOG_TAIL_LIMIT)
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('shellInstallLog', text)
  }
}

function bundledPackage(): { packageRoot: string; version: string } | null {
  const packageRoot = join(app.getAppPath(), 'node_modules', '@deepseek-ai', 'dsh')
  const info = readDshPackage(packageRoot)
  return info ? { packageRoot, version: info.version } : null
}

function execText(command: string, args: string[]): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(command, args, { timeout: 4000 }, (error, stdout) => {
      if (error) {
        resolve(null)
        return
      }
      resolve(stdout)
    })
  })
}

async function versionFromConnectedPage(): Promise<string | null> {
  if (!currentUrl) {
    return null
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 2500)
  try {
    const response = await fetch(currentUrl, { signal: controller.signal })
    if (!response.ok) {
      return null
    }
    return parseDshVersionFromText(await response.text())
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

async function currentDshVersion(): Promise<string | null> {
  if (
    currentSource.kind === 'pnpm-dlx' ||
    currentSource.kind === 'npx-cache' ||
    currentSource.kind === 'bundled'
  ) {
    return currentSource.version
  }
  return (
    (await readCliDshVersion(execText)) ??
    findPnpmDlxCachedDsh(join(homedir(), 'Library', 'Caches', 'pnpm', 'dlx'))?.version ??
    findNpxCachedDsh(join(homedir(), '.npm', '_npx'))?.version ??
    bundledPackage()?.version ??
    (await versionFromConnectedPage())
  )
}

function applyOpenAtLogin(enabled: boolean): void {
  if (!app.isPackaged) {
    return
  }
  app.setLoginItemSettings({
    openAtLogin: enabled,
    openAsHidden: true,
  })
}

function persistSettings(settings: Settings): boolean {
  const current = loadSettings(userData())
  const ok = saveSettings(userData(), {
    ...current,
    ...settings,
    lastPackageManager: settings.lastPackageManager ?? current.lastPackageManager,
    windowBounds: settings.windowBounds ?? current.windowBounds,
  })
  if (ok) {
    applyOpenAtLogin(loadSettings(userData()).openAtLogin)
  }
  return ok
}

function persistWindowBounds(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return
  }
  if (boundsTimer) {
    clearTimeout(boundsTimer)
  }
  boundsTimer = setTimeout(() => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      return
    }
    const current = loadSettings(userData())
    persistSettings({ ...current, windowBounds: mainWindow.getBounds() })
    layoutViews()
  }, 300)
}

function trayActions() {
  return {
    showMain,
    openSettings,
    quit: () => {
      void quitApp()
    },
  }
}

function currentLocalePreference(): LocalePreference {
  return loadSettings(userData()).locale ?? 'system'
}

async function applyLocale(preference: LocalePreference = currentLocalePreference()): Promise<void> {
  await changeLanguage(resolveLocale(preference, app.getLocale()))
  registerMenu()
  if (tray && !tray.isDestroyed()) {
    applyTrayMenu(tray, trayActions())
  }
  refreshTray()
}

function refreshTray(): void {
  if (!tray) {
    return
  }
  const connected = Boolean(currentUrl && currentSource.kind !== 'none')
  setTrayStatus(tray, starting ? t('tray.starting') : formatTrayStatus(currentSource, currentUrl), connected)
}

function stopWatch(): void {
  if (watchTimer) {
    clearInterval(watchTimer)
    watchTimer = null
  }
}

function startWatch(url: string): void {
  stopWatch()
  watchTimer = setInterval(() => {
    void probeHarnessWeb(url).then((ok) => {
      if (ok || quitting) {
        return
      }
      logShell(`lost ${url}`)
      currentUrl = null
      lastError = { code: 'error.unresponsive' }
      stopWatch()
      hideInstanceViews()
      void pushState()
      refreshTray()
    })
  }, WATCH_MS)
}

async function discoverRuntime(): Promise<RuntimeSource> {
  return resolveRuntime({
    settings: loadSettings(userData()),
    probe: probeHarnessWeb,
  })
}

function showMain(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return
  }
  if (mainWindow.isMinimized()) {
    mainWindow.restore()
  }
  mainWindow.show()
  mainWindow.focus()
}

function officialViewBlocked(): boolean {
  return overlayCount > 0 || hostDevToolsOpen
}

function acquireOverlay(): void {
  overlayCount += 1
  layoutViews()
}

function releaseOverlay(): void {
  overlayCount = Math.max(0, overlayCount - 1)
  layoutViews()
}

function openSettings(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return
  }
  acquireOverlay()
  mainWindow.webContents.send('shellOpenSettings')
}

function closeSettingsOverlay(): void {
  releaseOverlay()
}

function isDevHost(): boolean {
  return Boolean(process.env.VITE_DEV_SERVER_URL)
}

function focusedContents(): WebContents | null {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return null
  }
  const activeId = loadSettings(userData()).activeInstanceId
  if (activeId && !officialViewBlocked()) {
    const view = instanceViews.get(activeId)
    if (view && !view.webContents.isDestroyed() && view.webContents.isFocused()) {
      return view.webContents
    }
  }
  return mainWindow.webContents
}

function toggleDevTools(target?: WebContents): void {
  const contents = target && !target.isDestroyed() ? target : focusedContents()
  if (!contents || contents.isDestroyed()) {
    return
  }
  if (contents.isDevToolsOpened()) {
    contents.closeDevTools()
    return
  }
  contents.openDevTools({ mode: 'detach' })
}

function reloadInstanceView(instanceId?: string): boolean {
  const id = instanceId || loadSettings(userData()).activeInstanceId
  if (!id) {
    return false
  }
  const view = instanceViews.get(id)
  if (!view || view.webContents.isDestroyed()) {
    return false
  }
  view.webContents.reload()
  return true
}

function handleHostShortcut(action: HostShortcut, source: WebContents): void {
  if (action === 'reload-view') {
    if (!reloadInstanceView()) {
      source.reload()
    }
    return
  }
  if (action === 'toggle-devtools') {
    toggleDevTools(source)
    return
  }
  if (action === 'toggle-sidebar') {
    const current = loadSettings(userData())
    persistSettings({ ...current, sidebarCollapsed: !(current.sidebarCollapsed === true) })
    layoutViews()
    void pushState()
    return
  }
  if (action === 'quit') {
    void quitApp()
    return
  }
  openSettings()
}

function attachHostShortcuts(contents: WebContents): void {
  contents.on('before-input-event', (event, input) => {
    const action = hostShortcutFor(input, {
      isMac: process.platform === 'darwin',
      isDev: isDevHost(),
    })
    if (!action) {
      return
    }
    event.preventDefault()
    handleHostShortcut(action, contents)
  })
}

function loadHostPage(window: BrowserWindow): void {
  const devUrl = process.env.VITE_DEV_SERVER_URL
  if (devUrl) {
    loadHostUrl(window, devUrl)
    return
  }
  loadShellPage(window, rendererFile('index.html'))
}

function ensureHostPage(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return
  }
  const current = mainWindow.webContents.getURL()
  if (isHostPage(current, process.env.VITE_DEV_SERVER_URL)) {
    return
  }
  loadHostPage(mainWindow)
}

function hideInstanceViews(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return
  }
  for (const view of instanceViews.values()) {
    view.setVisible(false)
    mainWindow.contentView.removeChildView(view)
  }
}

function layoutViews(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return
  }
  const settings = loadSettings(userData())
  const activeId = settings.activeInstanceId
  const [width, height] = mainWindow.getContentSize()
  if (!officialViewBlocked()) {
    layoutActiveView(instanceViews, currentUrl ? activeId : null, { width, height }, {
      sidebarWidth: sidebarWidthFor(settings.sidebarCollapsed === true),
    })
  }
  for (const [id, view] of instanceViews) {
    const show = shouldShowInstanceView({
      hasUrl: Boolean(currentUrl),
      instanceId: id,
      activeId,
      overlayOpen: officialViewBlocked(),
    })
    view.setVisible(show)
    if (show) {
      mainWindow.contentView.addChildView(view)
    } else {
      mainWindow.contentView.removeChildView(view)
    }
  }
}

function showInstanceView(instanceId: string, url: string): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return
  }
  ensureHostPage()
  let view = instanceViews.get(instanceId)
  if (!view) {
    view = new WebContentsView({
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
      },
    })
    attachWindowGuards(view.webContents, new URL(url).origin)
    attachHostShortcuts(view.webContents)
    instanceViews.set(instanceId, view)
  }
  if (view.webContents.getURL() !== url) {
    void view.webContents.loadURL(url)
  }
  currentUrl = url
  lastError = null
  layoutViews()
  startWatch(url)
}

function destroyInstanceViews(): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    for (const view of instanceViews.values()) {
      mainWindow.contentView.removeChildView(view)
    }
  }
  instanceViews.clear()
  overlayCount = 0
  hostDevToolsOpen = false
}

async function stopOwnedHarness(): Promise<void> {
  if (!stopHarness) {
    return
  }
  await stopHarness()
  stopHarness = null
}

async function disconnectWithoutStopping(): Promise<void> {
  starting = false
  stopWatch()
  lastError = null
  currentSource = { kind: 'none' }
  currentUrl = null
  hideInstanceViews()
  refreshTray()
  await pushState()
}

async function stopLocalService(): Promise<void> {
  starting = false
  stopWatch()
  lastError = null
  const settings = loadSettings(userData())
  const active = activeInstance(settings)
  if (active?.kind === 'remote') {
    currentSource = { kind: 'remote', url: active.url }
    currentUrl = null
    lastError = { code: 'error.remoteDisconnected' }
    hideInstanceViews()
    refreshTray()
    await pushState()
    return
  }

  await stopOwnedHarness()
  const port = localPortFromSettings(settings)
  const pids = await stopListeningOnPort(port)
  if (pids.length) {
    logShell(`stopped local dsh web on ${port} (pid ${pids.join(', ')})`)
  } else {
    logShell(`no listener found on ${port}`)
  }
  currentSource = { kind: 'none' }
  currentUrl = null
  hideInstanceViews()
  refreshTray()
  await pushState()
}

// Stop the running local dsh web, then start it again with the saved launch
// command. Mirrors the update flow (never reuses the running service).
async function restartLocalService(): Promise<ShellState> {
  const settings = loadSettings(userData())
  const active = activeInstance(settings)
  if (active?.kind === 'remote') {
    lastError = { code: 'error.remoteDisconnected' }
    await pushState()
    return shellState()
  }
  const managers = await detectPackageManagers(lookupOnPath, localPortFromSettings(settings))
  const id =
    settings.lastPackageManager && managers.some((item) => item.id === settings.lastPackageManager)
      ? settings.lastPackageManager
      : managers[0]?.id
  if (!id) {
    lastError = { code: 'error.managerMissing' }
    await pushState()
    return shellState()
  }
  return installWithManager(id, { restart: true })
}

async function applySource(source: RuntimeSource): Promise<string | null> {
  currentSource = source
  if (source.kind === 'remote') {
    const reachable = await probeHarnessWeb(source.url)
    if (!reachable) {
      lastError = { code: 'error.remoteUnreachable', params: { url: source.url } }
      currentUrl = null
      return null
    }
    return source.url
  }

  const spec = launchSpecFor(source, undefined, localPortFromSettings(loadSettings(userData())))
  if (spec.kind === 'url') {
    return spec.url
  }
  return null
}

export type ShellState = {
  detected: boolean
  url: string | null
  sourceKind: string
  localPort: number
  instances: Instance[]
  activeInstanceId: string | null
  managers: PackageManagerOption[]
  lastError: HostError | null
  locale: LocalePreference
  lastPackageManager: PackageManagerId | null
  starting: boolean
  settingsOpen: boolean
  sidebarCollapsed: boolean
  openAtLogin: boolean
  autoStart: boolean
  appVersion: string
  dshVersion: string | null
}

async function shellState(): Promise<ShellState> {
  const settings = loadSettings(userData())
  return {
    detected: Boolean(currentUrl),
    url: currentUrl,
    sourceKind: currentSource.kind,
    localPort: localPortFromSettings(settings),
    instances: settings.instances,
    activeInstanceId: settings.activeInstanceId,
    managers: await detectPackageManagers(lookupOnPath, localPortFromSettings(settings)),
    lastError,
    locale: settings.locale ?? 'system',
    lastPackageManager: settings.lastPackageManager ?? null,
    starting,
    settingsOpen: false,
    sidebarCollapsed: settings.sidebarCollapsed === true,
    openAtLogin: settings.openAtLogin,
    autoStart: settings.autoStart,
    appVersion: app.getVersion(),
    dshVersion: await currentDshVersion(),
  }
}

async function pushState(): Promise<void> {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return
  }
  mainWindow.webContents.send('shellState', await shellState())
}

function rememberLocalView(previousId: string | undefined, nextId: string | undefined): void {
  if (!previousId || !nextId || previousId === nextId) {
    return
  }
  const view = instanceViews.get(previousId)
  if (!view) {
    return
  }
  instanceViews.delete(previousId)
  instanceViews.set(nextId, view)
}

function applyLocalPort(port: unknown): boolean {
  const parsed = parseLocalPort(port)
  if (parsed === null) {
    lastError = { code: 'error.invalidPort' }
    return false
  }
  const current = loadSettings(userData())
  const previous = current.instances.find((item) => item.kind === 'local')
  const next = setLocalPort(current, parsed)
  if (!next) {
    lastError = { code: 'error.invalidPort' }
    return false
  }
  if (next !== current) {
    persistSettings(next)
    rememberLocalView(previous?.id, next.instances.find((item) => item.kind === 'local')?.id)
  }
  return true
}

async function connectTarget(input: { host?: unknown; port?: unknown }): Promise<void> {
  const target = parseConnectTarget(input)
  if (!target) {
    lastError = { code: 'error.invalidTarget' }
    await pushState()
    return
  }

  if (isLoopbackHost(target.host)) {
    if (!applyLocalPort(target.port)) {
      await pushState()
      return
    }
    await connectActive({ spawn: false })
    if (!currentUrl && !lastError) {
      lastError = { code: 'error.notRunning', params: { url: `http://${target.host}:${target.port}` } }
      await pushState()
    }
    return
  }

  const url = `http://${target.host}:${target.port}`
  const reachable = await probeHarnessWeb(url)
  if (!reachable) {
    lastError = { code: 'error.unreachable', params: { url } }
    currentUrl = null
    hideInstanceViews()
    refreshTray()
    await pushState()
    return
  }

  currentSource = { kind: 'remote', url }
  showInstanceView(loadSettings(userData()).activeInstanceId, url)
  refreshTray()
  await pushState()
}

async function connectActive(opts?: { spawn?: boolean }): Promise<void> {
  starting = false
  lastError = null
  currentUrl = null
  stopWatch()
  ensureHostPage()

  const settings = loadSettings(userData())
  const active = activeInstance(settings)
  if (!active) {
    hideInstanceViews()
    refreshTray()
    await pushState()
    return
  }

  try {
    if (active.kind === 'remote') {
      await stopOwnedHarness()
    }
    const url = await applySource(await discoverRuntime())
    if (url) {
      showInstanceView(active.id, url)
      refreshTray()
      await pushState()
      return
    }
    const shouldSpawn = opts?.spawn ?? settings.autoStart
    if (active.kind === 'local' && settings.lastPackageManager && shouldSpawn) {
      await installWithManager(settings.lastPackageManager)
      return
    }
  } catch (error) {
    lastError = toHostError(error)
    if (currentSource.kind !== 'remote') {
      currentSource = { kind: 'none' }
    }
    logShell(lastError.code)
  }

  hideInstanceViews()
  refreshTray()
  await pushState()
}

async function showLocalUrl(url: string): Promise<void> {
  const settings = loadSettings(userData())
  const local = settings.instances.find((item) => item.kind === 'local') ?? settings.instances[0]
  if (!local) {
    return
  }
  persistSettings({ ...settings, activeInstanceId: local.id })
  showInstanceView(local.id, url)
}

async function installWithManager(
  id: PackageManagerId,
  opts?: { latest?: boolean; restart?: boolean },
): Promise<ShellState> {
  const settings = loadSettings(userData())
  const port = localPortFromSettings(settings)
  const managers = await detectPackageManagers(lookupOnPath, port)
  const chosen = managers.find((item) => item.id === id)
  if (!chosen) {
    lastError = { code: 'error.managerMissing' }
    starting = false
    return shellState()
  }

  persistSettings({ ...settings, lastPackageManager: id })
  lastError = null
  currentUrl = null
  hideInstanceViews()

  const reuseUrl = localWebUrl(port)
  if (await probeHarnessWeb(reuseUrl)) {
    if (opts?.latest || opts?.restart) {
      // Updating / restarting: never reuse the running service; restart it below.
      await stopLocalService()
    } else {
      currentSource = { kind: 'reuse-local', url: reuseUrl }
      starting = false
      await showLocalUrl(reuseUrl)
      refreshTray()
      await pushState()
      return shellState()
    }
  }

  const args = opts?.latest ? harnessWebArgsWithLatest(chosen.args) : chosen.args
  const preview = previewFor(chosen.commandPath, args)

  await stopOwnedHarness()
  starting = true
  emitInstallLog(`$ ${preview}\n`)
  refreshTray()
  await pushState()

  try {
    const started = await startHarnessWeb({
      command: chosen.commandPath,
      args,
      probe: probeHarnessWeb,
      timeoutMs: opts?.latest ? 300_000 : 120_000,
      onOutput: emitInstallLog,
    })
    stopHarness = started.stop
    currentSource = { kind: 'reuse-local', url: started.url }
    starting = false
    await showLocalUrl(started.url)
    refreshTray()
  } catch (error) {
    starting = false
    currentSource = { kind: 'none' }
    currentUrl = null
    lastError = toHostError(error)
    logShell(lastError.code)
    hideInstanceViews()
    refreshTray()
  }

  await pushState()
  return shellState()
}

// dlx/npx cache the resolved version. Re-target @deepseek-ai/dsh to
// @deepseek-ai/dsh@latest so the next launch pulls the new release.
function harnessWebArgsWithLatest(args: string[]): string[] {
  return args.map((item) => (item === DSH_PACKAGE ? `${DSH_PACKAGE}@latest` : item))
}

function ensureMainWindow(): BrowserWindow {
  if (mainWindow && !mainWindow.isDestroyed()) {
    return mainWindow
  }

  const settings = loadSettings(userData())
  mainWindow = createMainWindow({
    preloadPath: preloadFile('shell.cjs'),
    bounds: settings.windowBounds,
  })
  hideInsteadOfClose(mainWindow, () => quitting)
  attachHostShortcuts(mainWindow.webContents)
  mainWindow.webContents.on('devtools-opened', () => {
    hostDevToolsOpen = true
    layoutViews()
  })
  mainWindow.webContents.on('devtools-closed', () => {
    hostDevToolsOpen = false
    layoutViews()
  })
  mainWindow.once('ready-to-show', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show()
    }
  })
  mainWindow.on('resize', persistWindowBounds)
  mainWindow.on('move', persistWindowBounds)
  mainWindow.on('closed', () => {
    destroyInstanceViews()
    overlayCount = 0
    hostDevToolsOpen = false
    mainWindow = null
  })
  loadHostPage(mainWindow)
  return mainWindow
}

async function inspectUpdates(target: UpdateTarget = 'both'): Promise<UpdateReport> {
  const wantsApp = target === 'app' || target === 'both'
  const [report, release] = await Promise.all([
    checkUpdates({
      appCurrent: app.getVersion(),
      dshCurrent: await currentDshVersion(),
      target,
      fetchLatest: async (name) => {
        if (name === '@deepseek-ai/dsh') {
          return fetchNpmLatestVersion(name)
        }
        if ((name === 'dsh-desktop' || name === 'dsh-app') && GITHUB_REPO) {
          return fetchGithubLatestTag(GITHUB_REPO)
        }
        return null
      },
    }),
    wantsApp && GITHUB_REPO ? fetchGithubLatestRelease(GITHUB_REPO) : Promise.resolve(null),
  ])
  return mergeAppRelease(report, release, process.arch)
}

async function quitApp(): Promise<void> {
  if (quitting) {
    return
  }
  quitting = true
  stopWatch()
  persistWindowBounds()
  await stopOwnedHarness()
  destroyInstanceViews()
  app.quit()
}

function registerMenu(): void {
  const isMac = process.platform === 'darwin'
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' as const },
              { type: 'separator' as const },
              {
                label: t('menu.settings'),
                accelerator: 'CmdOrCtrl+,',
                click: () => openSettings(),
              },
              {
                label: t('menu.detect'),
                click: () => {
                  void connectActive()
                },
              },
              {
                label: t('menu.updates'),
                click: () => {
                  void inspectUpdates().then((report) => {
                    if (mainWindow && !mainWindow.isDestroyed()) {
                      mainWindow.webContents.send('updatesResult', report)
                    }
                  })
                  openSettings()
                },
              },
              { type: 'separator' as const },
              { role: 'hide' as const },
              { role: 'hideOthers' as const },
              { role: 'unhide' as const },
              { type: 'separator' as const },
              { role: 'quit' as const },
            ],
          },
        ]
      : []),
    {
      label: t('menu.edit'),
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: t('menu.view'),
      submenu: [
        {
          label: t('menu.reload'),
          accelerator: 'CmdOrCtrl+R',
          click: () => {
            reloadInstanceView()
          },
        },
        {
          label: t('menu.devtools'),
          accelerator: 'Alt+CmdOrCtrl+I',
          click: () => toggleDevTools(),
        },
        {
          label: t('menu.devtoolsConsole'),
          accelerator: process.platform === 'darwin' ? 'Alt+Command+J' : 'Ctrl+Shift+J',
          click: () => toggleDevTools(),
        },
      ],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function registerIpc(): void {
  ipcMain.handle('shellGetInstallLog', () => installLogTail.join(''))

  ipcMain.handle('settingsCheckUpdates', (_event, target?: unknown) =>
    inspectUpdates(target === 'app' || target === 'dsh' ? target : 'both'),
  )

  ipcMain.handle('shellGetState', () => shellState())

  ipcMain.handle('shellDetect', async (_event, input?: { host?: unknown; port?: unknown; localPort?: unknown }) => {
    if (input?.host !== undefined || input?.port !== undefined) {
      await connectTarget({ host: input.host, port: input.port ?? input.localPort })
      return shellState()
    }
    if (input?.localPort !== undefined && !applyLocalPort(input.localPort)) {
      return shellState()
    }
    await connectActive({ spawn: false })
    return shellState()
  })

  ipcMain.handle('shellSaveLocalPort', async (_event, input?: { localPort?: unknown }) => {
    if (!applyLocalPort(input?.localPort)) {
      return shellState()
    }
    lastError = null
    await pushState()
    return shellState()
  })

  ipcMain.handle('shellInstall', async (_event, id: PackageManagerId, input?: { localPort?: unknown }) => {
    if (input?.localPort !== undefined && !applyLocalPort(input.localPort)) {
      return shellState()
    }
    return installWithManager(id)
  })

  ipcMain.handle('shellUpdateDsh', async () => {
    const settings = loadSettings(userData())
    const managers = await detectPackageManagers(lookupOnPath, localPortFromSettings(settings))
    const id =
      settings.lastPackageManager && managers.some((item) => item.id === settings.lastPackageManager)
        ? settings.lastPackageManager
        : managers[0]?.id
    if (!id) {
      lastError = { code: 'error.managerMissing' }
      await pushState()
      return shellState()
    }
    return installWithManager(id, { latest: true })
  })

  ipcMain.handle('shellStop', async () => {
    await stopLocalService()
    return shellState()
  })

  ipcMain.handle('shellRestart', async () => {
    return restartLocalService()
  })

  ipcMain.handle('shellDisconnect', async () => {
    await disconnectWithoutStopping()
    return shellState()
  })

  ipcMain.handle('shellOpenSettings', () => {
    openSettings()
  })

  ipcMain.handle('shellCloseSettings', () => {
    closeSettingsOverlay()
  })

  ipcMain.handle('shellAcquireOverlay', () => {
    acquireOverlay()
  })

  ipcMain.handle('shellReleaseOverlay', () => {
    releaseOverlay()
  })

  ipcMain.handle('shellPopupInstanceMenu', async (event, input: { instanceId?: unknown }) => {
    const instanceId = typeof input?.instanceId === 'string' ? input.instanceId : ''
    if (!instanceId || !mainWindow || mainWindow.isDestroyed()) {
      return null
    }
    const instance = loadSettings(userData()).instances.find((item) => item.id === instanceId)
    if (!instance) {
      return null
    }
    const liveUrl = instance.id === loadSettings(userData()).activeInstanceId ? currentUrl : null
    const externalUrl = instanceExternalUrl({ url: liveUrl, fallbackUrl: instance.url })
    const canReload = Boolean(instanceViews.get(instance.id) && !instanceViews.get(instance.id)?.webContents.isDestroyed())
    return new Promise<InstanceMenuAction | null>((resolve) => {
      const menu = Menu.buildFromTemplate(
        instanceMenuItems(canReload, Boolean(externalUrl)).map((item): MenuItemConstructorOptions => {
          const icon = nativeImage.createFromNamedImage(item.symbol, [-1, 0, 1])
          return {
            id: item.id,
            label: item.label,
            enabled: item.enabled,
            icon: icon.isEmpty() ? undefined : icon,
            click: () => {
              if (item.id === 'reload') {
                reloadInstanceView(instance.id)
              }
              if (item.id === 'open-external' && externalUrl) {
                void shell.openExternal(externalUrl)
              }
              resolve(item.id)
            },
          }
        }),
      )
      menu.popup({
        window: mainWindow ?? undefined,
        callback: () => {
          resolve(null)
        },
      })
    })
  })

  ipcMain.handle('shellSelectInstance', async (_event, id: string) => {
    const next = selectInstance(loadSettings(userData()), id)
    if (next) {
      persistSettings(next)
      await connectActive()
    }
    return shellState()
  })

  ipcMain.handle(
    'shellAddInstance',
    async (_event, input: { name: string; kind: 'local' | 'remote'; url: string }) => {
      const next = upsertInstance(loadSettings(userData()), input)
      if (!next) {
        lastError = { code: 'error.remoteUrl' }
        return shellState()
      }
      persistSettings(next)
      await connectActive()
      return shellState()
    },
  )

  ipcMain.handle(
    'shellUpdateInstance',
    async (_event, input: { id: string; name: string; url: string }) => {
      const next = renameInstance(loadSettings(userData()), input.id, input.name)
      if (!next) {
        lastError = { code: 'error.invalidName' }
        return shellState()
      }
      persistSettings(next)
      await pushState()
      return shellState()
    },
  )

  ipcMain.handle('shellRemoveInstance', async (_event, id: string) => {
    const next = removeInstance(loadSettings(userData()), id)
    if (!next) {
      lastError = { code: 'error.keepLocal' }
      return shellState()
    }
    const view = instanceViews.get(id)
    if (view && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.contentView.removeChildView(view)
    }
    instanceViews.delete(id)
    persistSettings(next)
    await connectActive()
    return shellState()
  })

  ipcMain.handle(
    'shellSaveHost',
    async (_event, input: { openAtLogin?: boolean; autoStart?: boolean; locale?: unknown }) => {
      const current = loadSettings(userData())
      const nextLocale = isLocalePreference(input.locale) ? input.locale : current.locale ?? 'system'
      const ok = persistSettings({
        ...current,
        openAtLogin: input.openAtLogin === undefined ? current.openAtLogin : input.openAtLogin === true,
        autoStart: input.autoStart === undefined ? current.autoStart : input.autoStart === true,
        locale: nextLocale,
      })
      if (ok && nextLocale !== (current.locale ?? 'system')) {
        await applyLocale(nextLocale)
      }
      await pushState()
      return ok
    },
  )

  ipcMain.handle('shellOpenUserData', () => {
    void shell.openPath(userData())
  })

  ipcMain.handle('shellSetTheme', (_event, mode: unknown) => {
    if (mode === 'light' || mode === 'dark' || mode === 'system') {
      nativeTheme.themeSource = mode
    }
  })

  ipcMain.handle('shellSetSidebarCollapsed', (_event, collapsed: unknown) => {
    const next = collapsed === true
    const current = loadSettings(userData())
    if (current.sidebarCollapsed === next) {
      return
    }
    persistSettings({ ...current, sidebarCollapsed: next })
    layoutViews()
    void pushState()
  })

  ipcMain.handle('shellOpenExternal', (_event, url: unknown) => {
    if (typeof url !== 'string') {
      return
    }
    let parsed: URL
    try {
      parsed = new URL(url)
    } catch {
      return
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return
    }
    void shell.openExternal(parsed.toString())
  })

  ipcMain.handle('shellCopyToClipboard', (_event, text: unknown) => {
    if (typeof text !== 'string') {
      return
    }
    clipboard.writeText(text)
  })
}

// Keep the dev build isolated from an installed release copy of the app:
// a distinct name gives it its own userData directory and therefore its own
// single-instance lock, so both can run side by side. Must run before any
// userData access and before requestSingleInstanceLock().
if (!app.isPackaged) {
  const devName = 'dsh-desktop-dev'
  app.setName(devName)
  app.setPath('userData', join(app.getPath('appData'), devName))
}

repairProcessPath()

if (
  !bindSingleInstance({
    requestLock: () => app.requestSingleInstanceLock(),
    onSecondInstance: (handler) => {
      app.on('second-instance', handler)
    },
    quit: () => {
      app.quit()
    },
    focusExisting: () => {
      showMain()
    },
  })
) {
  app.quit()
}

void app.whenReady().then(async () => {
  await ready()
  applyDesktopIcon()
  registerIpc()
  await applyLocale()
  applyOpenAtLogin(loadSettings(userData()).openAtLogin)
  tray = createTray(trayActions())
  ensureMainWindow()
  await connectActive()
})

app.on('before-quit', (event) => {
  if (quitting) {
    return
  }
  event.preventDefault()
  void quitApp()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    void quitApp()
  }
})

app.on('activate', () => {
  if (mainWindow) {
    showMain()
  } else {
    ensureMainWindow()
    void connectActive()
  }
})
