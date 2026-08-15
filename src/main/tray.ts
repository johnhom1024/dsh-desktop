import { Menu, Tray, nativeImage, type BrowserWindow } from 'electron'

export function createTray(opts: {
  showMain: () => void
  openSettings: () => void
  checkUpdates: () => void
  quit: () => void
}): Tray {
  const tray = new Tray(nativeImage.createEmpty())
  tray.setTitle('dsh')
  tray.setToolTip('DeepSeek Harness')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: '显示窗口', click: opts.showMain },
      { label: '连接设置', click: opts.openSettings },
      { label: '检测更新', click: opts.checkUpdates },
      { type: 'separator' },
      { label: '退出', click: opts.quit },
    ]),
  )
  tray.on('click', opts.showMain)
  return tray
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
