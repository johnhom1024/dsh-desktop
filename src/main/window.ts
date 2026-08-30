import { existsSync } from 'node:fs'
import { BrowserWindow, app, nativeImage, shell, type WebContents } from 'electron'
import { clampWindowBounds, type WindowBounds } from './host-state.js'
import { TAB_BAR_HEIGHT } from './instance-views.js'
import { desktopIconFile, devIconFile, resolveDesktopIconFile } from './paths.js'

// Standard macOS traffic-light button height, used to center the buttons in
// the host tab bar when the native title bar is hidden. The glyphs sit slightly
// low inside their box, so lift them a few px for optical centering.
const TRAFFIC_LIGHT_HEIGHT = 12
const TRAFFIC_LIGHT_OPTICAL_LIFT = 3

export function loadDesktopIcon(): Electron.NativeImage | undefined {
  // Dev builds use a badged icon so they are distinguishable from the
  // installed release app in the Dock and app switcher.
  const candidates = app.isPackaged ? [desktopIconFile()] : [devIconFile(), desktopIconFile()]
  const file = resolveDesktopIconFile(existsSync, candidates)
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

export { TAB_BAR_HEIGHT }

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
    title: app.isPackaged ? 'dsh-desktop' : 'dsh-desktop (Dev)',
    icon: loadDesktopIcon(),
    // The 44px host tab bar is the window chrome. Hide the native title bar so
    // no app title text is shown; traffic lights sit inside the tab bar.
    ...(process.platform === 'darwin'
      ? {
          titleBarStyle: 'hiddenInset' as const,
          trafficLightPosition: {
            x: 16,
            y: Math.max(
              0,
              Math.round((TAB_BAR_HEIGHT - TRAFFIC_LIGHT_HEIGHT) / 2) - TRAFFIC_LIGHT_OPTICAL_LIFT,
            ),
          },
        }
      : {}),
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
