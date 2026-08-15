import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFile } from 'node:child_process'
import { BrowserWindow, app, ipcMain } from 'electron'
import { findNpxCachedDsh, findPnpmDlxCachedDsh, readDshPackage } from './dsh-package.js'
import { startHarnessWeb } from './harness-process.js'
import { launchSpecFor } from './launch.js'
import { probeHarnessWeb } from './probe.js'
import { resolveRuntime, type RuntimeSource, type Settings } from './runtime.js'
import { loadSettings, saveSettings } from './settings.js'
import { createTray, hideInsteadOfClose } from './tray.js'
import { createMainWindow, createSettingsWindow } from './window.js'

const here = dirname(fileURLToPath(import.meta.url))

let mainWindow: BrowserWindow | null = null
let settingsWindow: BrowserWindow | null = null
let currentSource: RuntimeSource = { kind: 'none' }
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
    join(here, '../preload/settings.js'),
    join(app.getAppPath(), 'src/renderer/settings.html'),
  )
  settingsWindow.on('closed', () => {
    settingsWindow = null
  })
}

async function connect(): Promise<void> {
  if (stopHarness) {
    await stopHarness()
    stopHarness = null
  }

  currentSource = await discoverRuntime()
  const spec = launchSpecFor(currentSource)
  let url: string | null = null

  try {
    if (spec.kind === 'url') {
      url = spec.url
    } else if (spec.kind === 'spawn') {
      const started = await startHarnessWeb({
        command: spec.command,
        args: spec.args,
        probe: probeHarnessWeb,
      })
      stopHarness = started.stop
      url = started.url
    }
  } catch {
    currentSource = { kind: 'none' }
    url = null
  }

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.removeAllListeners('close')
    mainWindow.destroy()
  }

  mainWindow = createMainWindow(url)
  hideInsteadOfClose(mainWindow, () => quitting)
  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

async function quitApp(): Promise<void> {
  quitting = true
  if (stopHarness) {
    await stopHarness()
    stopHarness = null
  }
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
    await connect()
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
  await connect()
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
    void connect()
  }
})
