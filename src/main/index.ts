import { execFile } from 'node:child_process'
import { join } from 'node:path'
import { BrowserWindow, Menu, Tray, WebContentsView, app, ipcMain, nativeTheme, shell, type WebContents } from 'electron'
import { readDshPackage } from './dsh-package.js'
import { readCliDshVersion } from './dsh-version.js'
import { startHarnessWeb, stopListeningOnPort } from './harness-process.js'
import { appendHostLog, formatTrayStatus } from './host-state.js'
import { removeInstance, renameInstance, selectInstance, upsertInstance } from './instances.js'
import { TAB_BAR_HEIGHT, layoutActiveView, shouldShowInstanceView } from './instance-views.js'
import { launchSpecFor } from './launch.js'
import {
  detectPackageManagers,
  lookupOnPath,
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
import { loadSettings, saveSettings } from './settings.js'
import { bindSingleInstance } from './single-instance.js'
import { createTray, hideInsteadOfClose, setTrayStatus } from './tray.js'
import {
  checkUpdates,
  fetchGithubLatestTag,
  fetchNpmLatestVersion,
  type UpdateReport,
} from './updates.js'
import { applyDesktopIcon, attachWindowGuards, createMainWindow, loadHostUrl, loadShellPage } from './window.js'

const GITHUB_REPO = process.env.DSH_DESKTOP_GITHUB_REPO ?? process.env.DSH_APP_GITHUB_REPO ?? ''
const WATCH_MS = 8_000

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let currentSource: RuntimeSource = { kind: 'none' }
let currentUrl: string | null = null
let lastError: string | null = null
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

function emitInstallLog(text: string): void {
  logWeb(text)
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

async function currentDshVersion(): Promise<string | null> {
  if (
    currentSource.kind === 'pnpm-dlx' ||
    currentSource.kind === 'npx-cache' ||
    currentSource.kind === 'bundled'
  ) {
    return currentSource.version
  }
  return (await readCliDshVersion(execText)) ?? bundledPackage()?.version ?? null
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

function refreshTray(): void {
  if (!tray) {
    return
  }
  setTrayStatus(tray, starting ? '正在启动…' : formatTrayStatus(currentSource, currentUrl))
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
      lastError = 'DeepSeek Harness 已停止响应。'
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

function reloadHostPage(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return
  }
  if (isDevHost()) {
    mainWindow.webContents.reloadIgnoringCache()
    return
  }
  loadHostPage(mainWindow)
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

function handleHostShortcut(action: HostShortcut, source: WebContents): void {
  if (action === 'reload-host') {
    reloadHostPage()
    return
  }
  if (action === 'reconnect') {
    void connectActive()
    return
  }
  if (action === 'toggle-devtools') {
    toggleDevTools(source)
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
  const activeId = loadSettings(userData()).activeInstanceId
  const [width, height] = mainWindow.getContentSize()
  if (!officialViewBlocked()) {
    layoutActiveView(instanceViews, currentUrl ? activeId : null, { width, height }, TAB_BAR_HEIGHT)
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

async function stopLocalService(): Promise<void> {
  starting = false
  stopWatch()
  lastError = null
  const settings = loadSettings(userData())
  const active = activeInstance(settings)
  if (active?.kind === 'remote') {
    currentSource = { kind: 'remote', url: active.url }
    currentUrl = null
    lastError = '已断开远程连接。'
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

async function applySource(source: RuntimeSource): Promise<string | null> {
  currentSource = source
  if (source.kind === 'remote') {
    const reachable = await probeHarnessWeb(source.url)
    if (!reachable) {
      lastError = `远程实例不可达：${source.url}`
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
  lastError: string | null
  lastPackageManager: PackageManagerId | null
  starting: boolean
  settingsOpen: boolean
  openAtLogin: boolean
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
    lastPackageManager: settings.lastPackageManager ?? null,
    starting,
    settingsOpen: false,
    openAtLogin: settings.openAtLogin,
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

async function connectActive(): Promise<void> {
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
    if (active.kind === 'local' && settings.lastPackageManager) {
      await installWithManager(settings.lastPackageManager)
      return
    }
  } catch (error) {
    lastError = error instanceof Error ? error.message : String(error)
    if (currentSource.kind !== 'remote') {
      currentSource = { kind: 'none' }
    }
    logShell(lastError)
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

async function installWithManager(id: PackageManagerId): Promise<ShellState> {
  const settings = loadSettings(userData())
  const port = localPortFromSettings(settings)
  const managers = await detectPackageManagers(lookupOnPath, port)
  const chosen = managers.find((item) => item.id === id)
  if (!chosen) {
    lastError = '没有找到这个包管理器，请先点检测。'
    starting = false
    return shellState()
  }

  persistSettings({ ...settings, lastPackageManager: id })
  lastError = null
  currentUrl = null
  hideInstanceViews()

  const reuseUrl = localWebUrl(port)
  if (await probeHarnessWeb(reuseUrl)) {
    currentSource = { kind: 'reuse-local', url: reuseUrl }
    starting = false
    await showLocalUrl(reuseUrl)
    refreshTray()
    await pushState()
    return shellState()
  }

  await stopOwnedHarness()
  starting = true
  emitInstallLog(`$ ${chosen.preview}\n`)
  refreshTray()
  await pushState()

  try {
    const started = await startHarnessWeb({
      command: chosen.commandPath,
      args: chosen.args,
      probe: probeHarnessWeb,
      timeoutMs: 120_000,
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
    lastError = error instanceof Error ? error.message : String(error)
    logShell(lastError)
    hideInstanceViews()
    refreshTray()
  }

  await pushState()
  return shellState()
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

async function inspectUpdates(): Promise<UpdateReport> {
  return checkUpdates({
    appCurrent: app.getVersion(),
    dshCurrent: await currentDshVersion(),
    fetchLatest: async (name) => {
      if (name === '@deepseek-ai/dsh') {
        return fetchNpmLatestVersion(name)
      }
      if ((name === 'dsh-desktop' || name === 'dsh-app') && GITHUB_REPO) {
        return fetchGithubLatestTag(GITHUB_REPO)
      }
      return null
    },
  })
}

async function quitApp(): Promise<void> {
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
                label: '设置…',
                accelerator: 'CmdOrCtrl+,',
                click: () => openSettings(),
              },
              ...(isDevHost()
                ? [
                    {
                      label: '重载宿主页',
                      accelerator: 'CmdOrCtrl+R',
                      click: () => reloadHostPage(),
                    },
                    {
                      label: '重新检测',
                      accelerator: 'Shift+CmdOrCtrl+R',
                      click: () => {
                        void connectActive()
                      },
                    },
                  ]
                : [
                    {
                      label: '重新检测',
                      accelerator: 'CmdOrCtrl+R',
                      click: () => {
                        void connectActive()
                      },
                    },
                  ]),
              {
                label: '检测更新…',
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
      label: '编辑',
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
      label: '查看',
      submenu: [
        {
          label: '开发者工具',
          accelerator: 'Alt+CmdOrCtrl+I',
          click: () => toggleDevTools(),
        },
        {
          label: '开发者工具（控制台）',
          accelerator: process.platform === 'darwin' ? 'Alt+Command+J' : 'Ctrl+Shift+J',
          click: () => toggleDevTools(),
        },
      ],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function registerIpc(): void {
  ipcMain.handle('settingsCheckUpdates', () => inspectUpdates())

  ipcMain.handle('shellGetState', () => shellState())

  ipcMain.handle('shellDetect', async () => {
    await connectActive()
    return shellState()
  })

  ipcMain.handle('shellInstall', (_event, id: PackageManagerId) => installWithManager(id))

  ipcMain.handle('shellStop', async () => {
    await stopLocalService()
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
    return new Promise<'rename' | null>((resolve) => {
      const menu = Menu.buildFromTemplate([
        {
          label: '重命名',
          click: () => {
            resolve('rename')
          },
        },
      ])
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
        lastError = '远程 URL 必须是 http 或 https'
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
        lastError = '名称不能为空'
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
      lastError = '至少保留一个本机实例'
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

  ipcMain.handle('shellSaveHost', (_event, input: { openAtLogin: boolean }) => {
    return persistSettings({ ...loadSettings(userData()), openAtLogin: input.openAtLogin === true })
  })

  ipcMain.handle('shellOpenUserData', () => {
    void shell.openPath(userData())
  })

  ipcMain.handle('shellSetTheme', (_event, mode: unknown) => {
    if (mode === 'light' || mode === 'dark' || mode === 'system') {
      nativeTheme.themeSource = mode
    }
  })
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
  applyDesktopIcon()
  registerIpc()
  registerMenu()
  applyOpenAtLogin(loadSettings(userData()).openAtLogin)
  tray = createTray({
    showMain,
    openSettings,
    detect: () => {
      void connectActive()
    },
    checkUpdates: () => {
      openSettings()
      void inspectUpdates().then((report) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('updatesResult', report)
        }
      })
    },
    quit: () => {
      void quitApp()
    },
  })
  ensureMainWindow()
  await connectActive()
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
