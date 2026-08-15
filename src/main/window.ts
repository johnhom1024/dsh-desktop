import { BrowserWindow, shell } from 'electron'
import { clampWindowBounds, type WindowBounds } from './host-state.js'

export function attachWindowGuards(window: BrowserWindow, allowedOrigin: string | null): void {
  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  window.webContents.on('will-navigate', (event, url) => {
    if (!allowedOrigin) {
      return
    }
    if (new URL(url).origin !== allowedOrigin) {
      event.preventDefault()
      void shell.openExternal(url)
    }
  })
}

export function createMainWindow(opts: {
  preloadPath: string
  bounds?: WindowBounds
}): BrowserWindow {
  const bounds = opts.bounds ? clampWindowBounds(opts.bounds) : undefined
  return new BrowserWindow({
    width: bounds?.width ?? 1280,
    height: bounds?.height ?? 840,
    x: bounds?.x,
    y: bounds?.y,
    title: 'DeepSeek Harness',
    webPreferences: {
      preload: opts.preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  })
}

export function loadShellPage(window: BrowserWindow, htmlPath: string): void {
  window.webContents.removeAllListeners('will-navigate')
  attachWindowGuards(window, new URL(`file://${htmlPath}`).origin)
  void window.loadFile(htmlPath)
}

export function loadHarnessPage(window: BrowserWindow, url: string): void {
  window.webContents.removeAllListeners('will-navigate')
  attachWindowGuards(window, new URL(url).origin)
  void window.loadURL(url)
}

export function createSettingsWindow(preloadPath: string, htmlPath: string): BrowserWindow {
  const window = new BrowserWindow({
    width: 520,
    height: 560,
    title: '连接设置',
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  })

  attachWindowGuards(window, new URL(`file://${htmlPath}`).origin)
  void window.loadFile(htmlPath)
  return window
}
