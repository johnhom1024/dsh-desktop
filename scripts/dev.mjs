import { spawn } from 'node:child_process'
import { createConnection } from 'node:net'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const viteUrl = process.env.VITE_DEV_SERVER_URL || 'http://127.0.0.1:5173/'
const vitePort = Number(new URL(viteUrl).port || 5173)

function run(command, args, extraEnv = {}) {
  return spawn(command, args, {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, ...extraEnv },
  })
}

function waitForPort(port, timeoutMs) {
  const started = Date.now()
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const socket = createConnection({ host: '127.0.0.1', port }, () => {
        socket.end()
        resolve(undefined)
      })
      socket.on('error', () => {
        socket.destroy()
        if (Date.now() - started > timeoutMs) {
          reject(new Error(`Vite did not start on ${port}`))
          return
        }
        setTimeout(attempt, 150)
      })
    }
    attempt()
  })
}

const vite = run('pnpm', ['exec', 'vite'])
vite.on('exit', (code) => {
  if (code && code !== 0 && !electronStarted) {
    process.exit(code)
  }
})

let electronStarted = false
await waitForPort(vitePort, 20_000)

const build = run('pnpm', ['run', 'build:main'])
const buildCode = await new Promise((resolve) => {
  build.on('exit', (code) => resolve(code ?? 1))
})
if (buildCode !== 0) {
  vite.kill('SIGTERM')
  process.exit(buildCode)
}

electronStarted = true
const electron = run('pnpm', ['exec', 'electron', '.'], {
  NODE_ENV: 'development',
  VITE_DEV_SERVER_URL: viteUrl,
})

function shutdown() {
  electron.kill('SIGTERM')
  vite.kill('SIGTERM')
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

electron.on('exit', (code) => {
  vite.kill('SIGTERM')
  process.exit(code ?? 0)
})
