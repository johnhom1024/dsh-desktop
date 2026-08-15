import { execFile } from 'node:child_process'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { BrowserWindow, Menu, app, ipcMain, shell } from 'electron'
import { findNpxCachedDsh, findPnpmDlxCachedDsh, readDshPackage } from './dsh-package.js'
import { startHarnessWeb } from './harness-process.js'
import { launchSpecFor } from './launch.js'
import {
  detectPackageManagers,
  lookupOnPath,
  type PackageManagerId,
  type PackageManagerOption,
} from './package-managers.js'
import { preloadFile, rendererFile } from './paths.js'
import { probeHarnessWeb } from './probe.js'
import { resolveRuntime, type RuntimeSource, type Settings } from './runtime.js'
import { loadSettings, saveSettings } from './settings.js'
import { createTray, hideInsteadOfClose } from './tray.js'
import { checkUpdates, fetchNpmLatestVersion, type UpdateReport } from './updates.js'
import { createMainWindow, createSettingsWindow, loadHarnessPage, loadShellPage } from './window.js'

let mainWindow: BrowserWindow | null = null
let settingsWindow: BrowserWindow | null = null
let currentSource: RuntimeSource = { kind: 'none' }
let currentUrl: string | null = null
let lastError: string | null = null
let stopHarness: (() => Promise<void>) | null = null
let quitting = false

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
  const ok = saveSettings(app.getPath('userData'), settings)
  if (ok) {
    applyOpenAtLogin(loadSettings(app.getPath('userData')).openAtLogin)
  }
  return ok
}

async function discoverRuntime(): Promise<RuntimeSource> {
  return resolveRuntime({
    settings: loadSettings(app.getPath('userData')),
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
  const spec = launchSpecFor(source)
  if (spec.kind === 'url') {
    return spec.url
  }
  if (spec.kind === 'spawn') {
    const started = await startHarnessWeb({
      command: spec.command,
      args: spec.args,
      probe: probeHarnessWeb,
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
}

async function shellState(): Promise<ShellState> {
  const settings = loadSettings(app.getPath('userData'))
  return {
    detected: Boolean(currentUrl),
    url: currentUrl,
    sourceKind: currentSource.kind,
    localPort: settings.localPort,
    managers: await detectPackageManagers(lookupOnPath),
    lastError,
  }
}

async function connect(opts: { preferShell: boolean } = { preferShell: false }): Promise<void> {
  await stopOwnedHarness()
  lastError = null
  currentUrl = null

  try {
    const url = await applySource(await discoverRuntime())
    if (url) {
      currentUrl = url
      showHarness(url)
      return
    }
  } catch (error) {
    lastError = error instanceof Error ? error.message : String(error)
    currentSource = { kind: 'none' }
  }

  if (opts.preferShell || !currentUrl) {
    showShell()
  }
}

async function installWithManager(id: PackageManagerId): Promise<ShellState> {
  const managers = await detectPackageManagers(lookupOnPath)
  const chosen = managers.find((item) => item.id === id)
  if (!chosen) {
    lastError = '没有找到这个包管理器，请先点检测。'
    return shellState()
  }

  await stopOwnedHarness()
  lastError = null

  try {
    const started = await startHarnessWeb({
      command: chosen.commandPath,
      args: chosen.args,
      probe: probeHarnessWeb,
      timeoutMs: 120_000,
    })
    stopHarness = started.stop
    currentSource = { kind: 'reuse-local', url: started.url }
    showHarness(started.url)
  } catch (error) {
    currentSource = { kind: 'none' }
    currentUrl = null
    lastError = error instanceof Error ? error.message : String(error)
    showShell()
  }

  return shellState()
}

function ensureMainWindow(): BrowserWindow {
  if (mainWindow && !mainWindow.isDestroyed()) {
    return mainWindow
  }

  mainWindow = createMainWindow({
    preloadPath: preloadFile('shell.js'),
  })
  hideInsteadOfClose(mainWindow, () => quitting)
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
      return null
    },
  })
}

async function quitApp(): Promise<void> {
  quitting = true
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
    settings: loadSettings(app.getPath('userData')),
    sourceKind: currentSource.kind,
    appVersion: app.getVersion(),
  }))

  ipcMain.handle('settingsSave', (_event, settings: Settings) => persistSettings(settings))

  ipcMain.handle('settingsReconnect', async () => {
    await connect({ preferShell: true })
  })

  ipcMain.handle('settingsCheckUpdates', () => inspectUpdates())

  ipcMain.handle('settingsOpenExternal', (_event, url: string) => {
    if (url.startsWith('https://www.npmjs.com/package/')) {
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

void app.whenReady().then(async () => {
  registerIpc()
  registerMenu()
  applyOpenAtLogin(loadSettings(app.getPath('userData')).openAtLogin)
  createTray({
    showMain,
    openSettings,
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
