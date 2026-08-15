import { BrowserWindow, shell } from 'electron'

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
}): BrowserWindow {
  return new BrowserWindow({
    width: 1280,
    height: 840,
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
    height: 420,
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
