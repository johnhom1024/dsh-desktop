import { Menu, Tray, nativeImage, type BrowserWindow } from 'electron'
import { t } from '../i18n/index.js'

export function createTray(opts: {
  showMain: () => void
  openSettings: () => void
  detect: () => void
  checkUpdates: () => void
  quit: () => void
}): Tray {
  const tray = new Tray(nativeImage.createEmpty())
  tray.setTitle('dsh')
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
    detect: () => void
    checkUpdates: () => void
    quit: () => void
  },
): void {
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: t('tray.show'), click: opts.showMain },
      { label: t('tray.detect'), click: opts.detect },
      { label: t('tray.settings'), click: opts.openSettings },
      { label: t('tray.updates'), click: opts.checkUpdates },
      { type: 'separator' },
      { label: t('tray.quit'), click: opts.quit },
    ]),
  )
}

export function setTrayStatus(tray: Tray, text: string, connected = text.startsWith(t('tray.connected'))): void {
  tray.setToolTip(`DeepSeek Harness · ${text}`)
  tray.setTitle(connected ? 'dsh ✓' : 'dsh')
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
