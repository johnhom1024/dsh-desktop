import { spawn, type ChildProcess } from 'node:child_process'

const LOOPBACK_URL = /https?:\/\/(?:127\.0\.0\.1|localhost):\d+\/?/i

export function parseHarnessWebUrl(output: string): string | null {
  const match = output.match(LOOPBACK_URL)
  if (!match) {
    return null
  }

  const url = new URL(match[0])
  if (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') {
    return null
  }

  return `${url.protocol}//127.0.0.1:${url.port}/`
}

async function waitForExit(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return
  }

  await new Promise<void>((resolve) => {
    child.once('exit', () => resolve())
  })
}

export async function stopChild(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return
  }

  child.kill('SIGTERM')
  const timedOut = await Promise.race([
    waitForExit(child).then(() => false),
    new Promise<boolean>((resolve) => {
      setTimeout(() => resolve(true), 1000)
    }),
  ])

  if (timedOut && child.exitCode === null && child.signalCode === null) {
    child.kill('SIGKILL')
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
}): Promise<{ url: string; child: ChildProcess; stop: () => Promise<void> }> {
  const timeoutMs = opts.timeoutMs ?? 20_000
  const child = spawn(opts.command, opts.args, {
    cwd: opts.cwd,
    env: opts.env,
    stdio: ['ignore', 'pipe', 'pipe'],
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
      void finishError(
        new Error(
          parseHarnessWebUrl(output)
            ? `dsh web at ${parseHarnessWebUrl(output)} did not become ready`
            : 'dsh web did not print a loopback url',
        ),
      )
    }, timeoutMs)

    const onChunk = (chunk: Buffer): void => {
      output += chunk.toString('utf8')
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
