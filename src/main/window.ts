import { existsSync } from 'node:fs'
import { BrowserWindow, app, nativeImage, shell, type WebContents } from 'electron'
import { clampWindowBounds, type WindowBounds } from './host-state.js'
import { desktopIconFile, resolveDesktopIconFile } from './paths.js'

export function loadDesktopIcon(): Electron.NativeImage | undefined {
  const file = resolveDesktopIconFile(existsSync, [desktopIconFile()])
  if (!file) {
    return undefined
  }
  const icon = nativeImage.createFromPath(file)
  return icon.isEmpty() ? undefined : icon
}

export function applyDesktopIcon(): void {
  const icon = loadDesktopIcon()
  if (!icon) {
    return
  }
  if (process.platform === 'darwin' && app.dock) {
    app.dock.setIcon(icon)
  }
}

export { TAB_BAR_HEIGHT } from './instance-views.js'

export function attachWindowGuards(contents: WebContents, allowedOrigin: string | null): void {
  contents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  contents.on('will-navigate', (event, url) => {
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
    show: false,
    backgroundColor: '#eef1f4',
    title: 'dsh-desktop',
    icon: loadDesktopIcon(),
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
  attachWindowGuards(window.webContents, new URL(`file://${htmlPath}`).origin)
  void window.loadFile(htmlPath)
}

export function loadHostUrl(window: BrowserWindow, url: string): void {
  window.webContents.removeAllListeners('will-navigate')
  attachWindowGuards(window.webContents, new URL(url).origin)
  void window.loadURL(url)
}
