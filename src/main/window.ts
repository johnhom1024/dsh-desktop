import { BrowserWindow, shell } from 'electron'

const MISSING_RUNTIME_HTML = `<!doctype html>
<meta charset="utf-8">
<title>dsh-app</title>
<style>
  body { font: 15px/1.5 -apple-system, BlinkMacSystemFont, sans-serif; margin: 48px; color: #1f2328; }
  h1 { font-size: 20px; }
  code { background: #f3f4f6; padding: 0.1em 0.35em; border-radius: 4px; }
</style>
<h1>未找到 DeepSeek Harness 运行时</h1>
<p>本机 <code>127.0.0.1:3080</code> 现在不是官方 Web UI，PATH、pnpm dlx 和 npx 缓存里也没有 <code>@deepseek-ai/dsh</code>。</p>
<p>打开连接设置，改成远程实例，或先在终端运行 <code>pnpm dlx @deepseek-ai/dsh web</code>。</p>
`

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

export function createMainWindow(url: string | null): BrowserWindow {
  const window = new BrowserWindow({
    width: 1280,
    height: 840,
    title: 'DeepSeek Harness',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  })

  if (url) {
    attachWindowGuards(window, new URL(url).origin)
    void window.loadURL(url)
  } else {
    attachWindowGuards(window, null)
    void window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(MISSING_RUNTIME_HTML)}`)
  }

  return window
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
