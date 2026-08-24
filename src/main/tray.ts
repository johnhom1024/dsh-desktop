import { Menu, Tray, nativeImage, type BrowserWindow } from 'electron'
import { t } from '../i18n/index.js'
import { trayIconFile } from './paths.js'

// Monochrome whale silhouette as a macOS template image so it adapts to
// light/dark menu bars. Connected state uses full strength; disconnected is a
// dimmed variant. The @2x variants are picked up automatically by Electron.
function whaleTrayImage(connected: boolean): Electron.NativeImage {
  const icon = nativeImage.createFromPath(trayIconFile(connected ? 'normal' : 'dim'))
  if (icon.isEmpty()) {
    return nativeImage.createEmpty()
  }
  icon.setTemplateImage(true)
  return icon
}

export function createTray(opts: {
  showMain: () => void
  openSettings: () => void
  quit: () => void
}): Tray {
  const tray = new Tray(whaleTrayImage(true))
  tray.setToolTip('DeepSeek Harness')
  applyTrayMenu(tray, opts)
  tray.on('click', opts.showMain)
  return tray
}

export function applyTrayMenu(
  tray: Tray,
  opts: {
    showMain: () => void
    openSettings: () => void
    quit: () => void
  },
): void {
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: t('tray.show'), click: opts.showMain },
      { label: t('tray.settings'), click: opts.openSettings },
      { type: 'separator' },
      { label: t('tray.quit'), click: opts.quit },
    ]),
  )
}

export function setTrayStatus(tray: Tray, text: string, connected = text.startsWith(t('tray.connected'))): void {
  tray.setToolTip(`DeepSeek Harness · ${text}`)
  const image = whaleTrayImage(connected)
  if (!image.isEmpty()) {
    tray.setImage(image)
  }
  tray.setTitle('')
}

export function hideInsteadOfClose(window: BrowserWindow, isQuitting: () => boolean): void {
  window.on('close', (event) => {
    if (isQuitting()) {
      return
    }
    event.preventDefault()
    window.hide()
  })
}
