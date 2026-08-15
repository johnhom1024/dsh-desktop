import { execFile } from 'node:child_process'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { BrowserWindow, app, ipcMain } from 'electron'
import { findNpxCachedDsh, findPnpmDlxCachedDsh, readDshPackage } from './dsh-package.js'
import { startHarnessWeb } from './harness-process.js'
import { launchSpecFor } from './launch.js'
import {
  detectPackageManagers,
  lookupOnPath,
  type PackageManagerId,
  type PackageManagerOption,
} from './package-managers.js'
import { probeHarnessWeb } from './probe.js'
import { resolveRuntime, type RuntimeSource, type Settings } from './runtime.js'
import { loadSettings, saveSettings } from './settings.js'
import { createTray, hideInsteadOfClose } from './tray.js'
import { createMainWindow, createSettingsWindow, loadHarnessPage, loadShellPage } from './window.js'

const here = dirname(fileURLToPath(import.meta.url))

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

  settingsWindow = createSettingsWindow(
    join(here, '../preload/shell.js'),
    join(app.getAppPath(), 'src/renderer/settings.html'),
  )
  settingsWindow.on('closed', () => {
    settingsWindow = null
  })
}

function showShell(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return
  }
  loadShellPage(mainWindow, join(app.getAppPath(), 'src/renderer/shell.html'))
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
    preloadPath: join(here, '../preload/shell.js'),
  })
  hideInsteadOfClose(mainWindow, () => quitting)
  mainWindow.on('closed', () => {
    mainWindow = null
  })
  return mainWindow
}

async function quitApp(): Promise<void> {
  quitting = true
  await stopOwnedHarness()
  app.quit()
}

function registerIpc(): void {
  ipcMain.handle('settingsGet', () => ({
    settings: loadSettings(app.getPath('userData')),
    sourceKind: currentSource.kind,
  }))

  ipcMain.handle('settingsSave', (_event, settings: Settings) =>
    saveSettings(app.getPath('userData'), settings),
  )

  ipcMain.handle('settingsReconnect', async () => {
    await connect({ preferShell: true })
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
  createTray({
    showMain,
    openSettings,
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
