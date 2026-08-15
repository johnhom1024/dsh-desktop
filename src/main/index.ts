import { execFile } from 'node:child_process'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { BrowserWindow, Menu, Tray, app, ipcMain, shell } from 'electron'
import { findNpxCachedDsh, findPnpmDlxCachedDsh, readDshPackage } from './dsh-package.js'
import { startHarnessWeb } from './harness-process.js'
import { appendHostLog, formatTrayStatus } from './host-state.js'
import { launchSpecFor } from './launch.js'
import {
  detectPackageManagers,
  lookupOnPath,
  type PackageManagerId,
  type PackageManagerOption,
} from './package-managers.js'
import { repairProcessPath } from './path-repair.js'
import { preloadFile, rendererFile } from './paths.js'
import { probeHarnessWeb } from './probe.js'
import { resolveRuntime, type RuntimeSource, type Settings } from './runtime.js'
import { loadSettings, saveSettings } from './settings.js'
import { bindSingleInstance } from './single-instance.js'
import { createTray, hideInsteadOfClose, setTrayStatus } from './tray.js'
import {
  checkUpdates,
  fetchGithubLatestTag,
  fetchNpmLatestVersion,
  type UpdateReport,
} from './updates.js'
import { createMainWindow, createSettingsWindow, loadHarnessPage, loadShellPage } from './window.js'

const GITHUB_REPO = process.env.DSH_APP_GITHUB_REPO ?? ''
const WATCH_MS = 8_000

let mainWindow: BrowserWindow | null = null
let settingsWindow: BrowserWindow | null = null
let tray: Tray | null = null
let currentSource: RuntimeSource = { kind: 'none' }
let currentUrl: string | null = null
let lastError: string | null = null
let stopHarness: (() => Promise<void>) | null = null
let quitting = false
let watchTimer: ReturnType<typeof setInterval> | null = null
let boundsTimer: ReturnType<typeof setTimeout> | null = null

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

function whichDsh(): Promise<string | null> {
  return new Promise((resolve) => {
    execFile('which', ['dsh'], (error, stdout) => {
      if (error) {
        resolve(null)
        return
      }
      resolve(stdout.trim() || null)
    })
  })
}

function bundledPackage(): { packageRoot: string; version: string } | null {
  const packageRoot = join(app.getAppPath(), 'node_modules', '@deepseek-ai', 'dsh')
  const info = readDshPackage(packageRoot)
  return info ? { packageRoot, version: info.version } : null
}

function currentDshVersion(): string | null {
  if (
    currentSource.kind === 'pnpm-dlx' ||
    currentSource.kind === 'npx-cache' ||
    currentSource.kind === 'bundled'
  ) {
    return currentSource.version
  }
  return bundledPackage()?.version ?? null
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
  }, 300)
}

function refreshTray(): void {
  if (!tray) {
    return
  }
  setTrayStatus(tray, formatTrayStatus(currentSource, currentUrl))
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
      currentSource = { kind: 'none' }
      lastError = 'DeepSeek Harness 已停止响应，已回到外壳。'
      stopWatch()
      showShell()
      refreshTray()
    })
  }, WATCH_MS)
}

async function discoverRuntime(): Promise<RuntimeSource> {
  return resolveRuntime({
    settings: loadSettings(userData()),
    probe: probeHarnessWeb,
    whichDsh,
    findPnpmDlx: async () =>
      findPnpmDlxCachedDsh(join(homedir(), 'Library', 'Caches', 'pnpm', 'dlx')),
    findNpxCache: async () => findNpxCachedDsh(join(homedir(), '.npm', '_npx')),
    bundled: bundledPackage(),
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

function openSettings(): void {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.show()
    settingsWindow.focus()
    return
  }

  settingsWindow = createSettingsWindow(preloadFile('shell.js'), rendererFile('settings.html'))
  settingsWindow.on('closed', () => {
    settingsWindow = null
  })
}

function showShell(): void {
  stopWatch()
  if (!mainWindow || mainWindow.isDestroyed()) {
    return
  }
  loadShellPage(mainWindow, rendererFile('shell.html'))
}

function showHarness(url: string): void {
  currentUrl = url
  lastError = null
  if (!mainWindow || mainWindow.isDestroyed()) {
    return
  }
  loadHarnessPage(mainWindow, url)
  startWatch(url)
}

async function stopOwnedHarness(): Promise<void> {
  if (!stopHarness) {
    return
  }
  await stopHarness()
  stopHarness = null
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

  const spec = launchSpecFor(source)
  if (spec.kind === 'url') {
    return spec.url
  }
  if (spec.kind === 'spawn') {
    const started = await startHarnessWeb({
      command: spec.command,
      args: spec.args,
      probe: probeHarnessWeb,
      onOutput: emitInstallLog,
    })
    stopHarness = started.stop
    return started.url
  }
  return null
}

export type ShellState = {
  detected: boolean
  url: string | null
  sourceKind: string
  localPort: number
  managers: PackageManagerOption[]
  lastError: string | null
  lastPackageManager: PackageManagerId | null
}

async function shellState(): Promise<ShellState> {
  const settings = loadSettings(userData())
  return {
    detected: Boolean(currentUrl),
    url: currentUrl,
    sourceKind: currentSource.kind,
    localPort: settings.localPort,
    managers: await detectPackageManagers(lookupOnPath),
    lastError,
    lastPackageManager: settings.lastPackageManager ?? null,
  }
}

async function connect(opts: { preferShell: boolean } = { preferShell: false }): Promise<void> {
  await stopOwnedHarness()
  lastError = null
  currentUrl = null
  stopWatch()

  try {
    const url = await applySource(await discoverRuntime())
    if (url) {
      currentUrl = url
      showHarness(url)
      refreshTray()
      return
    }
  } catch (error) {
    lastError = error instanceof Error ? error.message : String(error)
    if (currentSource.kind !== 'remote') {
      currentSource = { kind: 'none' }
    }
    logShell(lastError)
  }

  if (opts.preferShell || !currentUrl) {
    showShell()
  }
  refreshTray()
}

async function installWithManager(id: PackageManagerId): Promise<ShellState> {
  const managers = await detectPackageManagers(lookupOnPath)
  const chosen = managers.find((item) => item.id === id)
  if (!chosen) {
    lastError = '没有找到这个包管理器，请先点检测。'
    return shellState()
  }

  persistSettings({ ...loadSettings(userData()), lastPackageManager: id })
  await stopOwnedHarness()
  lastError = null
  emitInstallLog(`$ ${chosen.preview}\n`)

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
    showHarness(started.url)
    refreshTray()
  } catch (error) {
    currentSource = { kind: 'none' }
    currentUrl = null
    lastError = error instanceof Error ? error.message : String(error)
    logShell(lastError)
    showShell()
    refreshTray()
  }

  return shellState()
}

function ensureMainWindow(): BrowserWindow {
  if (mainWindow && !mainWindow.isDestroyed()) {
    return mainWindow
  }

  const settings = loadSettings(userData())
  mainWindow = createMainWindow({
    preloadPath: preloadFile('shell.js'),
    bounds: settings.windowBounds,
  })
  hideInsteadOfClose(mainWindow, () => quitting)
  mainWindow.on('resize', persistWindowBounds)
  mainWindow.on('move', persistWindowBounds)
  mainWindow.on('closed', () => {
    mainWindow = null
  })
  return mainWindow
}

async function inspectUpdates(): Promise<UpdateReport> {
  return checkUpdates({
    appCurrent: app.getVersion(),
    dshCurrent: currentDshVersion(),
    fetchLatest: async (name) => {
      if (name === '@deepseek-ai/dsh') {
        return fetchNpmLatestVersion(name)
      }
      if (name === 'dsh-app' && GITHUB_REPO) {
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
              {
                label: '重新检测',
                accelerator: 'CmdOrCtrl+R',
                click: () => {
                  void connect({ preferShell: true })
                },
              },
              {
                label: '检测更新…',
                click: () => {
                  void inspectUpdates().then((report) => {
                    if (settingsWindow && !settingsWindow.isDestroyed()) {
                      settingsWindow.webContents.send('updatesResult', report)
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
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function registerIpc(): void {
  ipcMain.handle('settingsGet', () => ({
    settings: loadSettings(userData()),
    sourceKind: currentSource.kind,
    appVersion: app.getVersion(),
    lastError,
  }))

  ipcMain.handle('settingsSave', (_event, settings: Settings) => persistSettings(settings))

  ipcMain.handle('settingsReconnect', async () => {
    await connect({ preferShell: true })
  })

  ipcMain.handle('settingsCheckUpdates', () => inspectUpdates())

  ipcMain.handle('settingsOpenExternal', (_event, url: string) => {
    if (
      url.startsWith('https://www.npmjs.com/package/') ||
      url.startsWith('https://github.com/')
    ) {
      void shell.openExternal(url)
    }
  })

  ipcMain.handle('shellGetState', () => shellState())

  ipcMain.handle('shellDetect', async () => {
    await connect({ preferShell: true })
    return shellState()
  })

  ipcMain.handle('shellInstall', (_event, id: PackageManagerId) => installWithManager(id))

  ipcMain.handle('shellOpenSettings', () => {
    openSettings()
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
  registerIpc()
  registerMenu()
  applyOpenAtLogin(loadSettings(userData()).openAtLogin)
  tray = createTray({
    showMain,
    openSettings,
    detect: () => {
      void connect({ preferShell: true })
    },
    checkUpdates: () => {
      openSettings()
      void inspectUpdates().then((report) => {
        if (settingsWindow && !settingsWindow.isDestroyed()) {
          settingsWindow.webContents.send('updatesResult', report)
        }
      })
    },
    quit: () => {
      void quitApp()
    },
  })
  ensureMainWindow()
  await connect({ preferShell: true })
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
    void connect({ preferShell: true })
  }
})
