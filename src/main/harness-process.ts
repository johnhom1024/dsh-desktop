import { execFile, spawn, type ChildProcess } from 'node:child_process'
import { CodedError } from '../i18n/index.js'

const LOOPBACK_URL = /https?:\/\/(?:127\.0\.0\.1|localhost):\d+(?:\/\??[^ \t\r\n]*)?/i
const INTERACTIVE_PROMPT = /choose which packages to build|approve(?:-| )builds|\? choose |press (?:enter|space)|use (?:arrow|the arrow) keys/i

export function looksLikeInteractivePrompt(output: string): boolean {
  return INTERACTIVE_PROMPT.test(output)
}

export function nonInteractiveEnv(extra?: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return {
    ...process.env,
    CI: '1',
    npm_config_yes: 'true',
    ...extra,
  }
}

export function parseHarnessWebUrl(output: string): string | null {
  const match = output.match(LOOPBACK_URL)
  if (!match) {
    return null
  }

  const url = new URL(match[0])
  if (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') {
    return null
  }

  // dsh 0.1.2+ prints a launch token (?token=...). Keep it so the WebContentsView
  // can exchange it for the browser-auth cookie on first load.
  const search = url.search
  return `${url.protocol}//127.0.0.1:${url.port}/${search}`
}

async function waitForExit(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return
  }

  await new Promise<void>((resolve) => {
    child.once('exit', () => resolve())
  })
}

function signalProcessGroup(pid: number, signal: NodeJS.Signals): void {
  try {
    process.kill(-pid, signal)
  } catch {
    try {
      process.kill(pid, signal)
    } catch {
      // already gone
    }
  }
}

function execText(command: string, args: string[]): Promise<string> {
  return new Promise((resolve) => {
    execFile(command, args, { timeout: 4000 }, (_error, stdout) => {
      resolve(stdout ?? '')
    })
  })
}

export async function stopListeningOnPort(
  port: number,
  exec: (command: string, args: string[]) => Promise<string> = execText,
): Promise<number[]> {
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return []
  }

  const stdout = await exec('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'])
  const pids = stdout
    .split(/\s+/)
    .map((item) => Number(item))
    .filter((pid) => Number.isInteger(pid) && pid > 0)

  for (const pid of pids) {
    try {
      process.kill(pid, 'SIGTERM')
    } catch {
      // already gone
    }
  }

  if (pids.length === 0) {
    return []
  }

  await new Promise((resolve) => setTimeout(resolve, 300))
  const still = (await exec('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t']))
    .split(/\s+/)
    .map((item) => Number(item))
    .filter((pid) => Number.isInteger(pid) && pid > 0)
  for (const pid of still) {
    try {
      process.kill(pid, 'SIGKILL')
    } catch {
      // already gone
    }
  }
  return pids
}

export async function stopChild(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return
  }

  const pid = child.pid
  if (pid) {
    signalProcessGroup(pid, 'SIGTERM')
  } else {
    child.kill('SIGTERM')
  }

  const timedOut = await Promise.race([
    waitForExit(child).then(() => false),
    new Promise<boolean>((resolve) => {
      setTimeout(() => resolve(true), 1000)
    }),
  ])

  if (timedOut && child.exitCode === null && child.signalCode === null) {
    if (pid) {
      signalProcessGroup(pid, 'SIGKILL')
    } else {
      child.kill('SIGKILL')
    }
    await waitForExit(child)
  }
}

export async function startHarnessWeb(opts: {
  command: string
  args: string[]
  cwd?: string
  env?: NodeJS.ProcessEnv
  probe: (url: string) => Promise<boolean>
  timeoutMs?: number
  onOutput?: (text: string) => void
}): Promise<{ url: string; child: ChildProcess; stop: () => Promise<void> }> {
  const timeoutMs = opts.timeoutMs ?? 20_000
  const child = spawn(opts.command, opts.args, {
    cwd: opts.cwd,
    env: nonInteractiveEnv(opts.env),
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  })

  const stop = () => stopChild(child)
  let output = ''
  let settled = false

  return await new Promise((resolve, reject) => {
    const finishError = async (error: Error): Promise<void> => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timer)
      await stop()
      reject(error)
    }

    const timer = setTimeout(() => {
      const url = parseHarnessWebUrl(output)
      void finishError(
        url ? new CodedError('error.notReady', { url }) : new CodedError('error.noLoopbackUrl'),
      )
    }, timeoutMs)

    const onChunk = (chunk: Buffer): void => {
      const text = chunk.toString('utf8')
      output += text
      opts.onOutput?.(text)
      if (looksLikeInteractivePrompt(output)) {
        void finishError(new CodedError('error.interactivePrompt'))
        return
      }
      const url = parseHarnessWebUrl(output)
      if (!url || settled) {
        return
      }

      void opts.probe(url).then((ready) => {
        if (!ready || settled) {
          return
        }
        settled = true
        clearTimeout(timer)
        resolve({ url, child, stop })
      })
    }

    child.stdout?.on('data', onChunk)
    child.stderr?.on('data', onChunk)
    child.once('error', (error) => {
      void finishError(error)
    })
    child.once('exit', (code, signal) => {
      void finishError(
        new Error(`dsh web exited before becoming ready (${code ?? signal ?? 'unknown'})`),
      )
    })
  })
}
