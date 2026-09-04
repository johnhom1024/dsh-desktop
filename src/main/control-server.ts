import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'

export const CONTROL_HOST = '127.0.0.1'
export const CONTROL_PORT = 8999

export type ControlAction = 'restart' | 'upgrade'

export type ControlStatus = {
  local: boolean
  busy: boolean
  dshVersion: string | null
  localPort: number
}

export type ControlServerHooks = {
  isBusy: () => boolean
  status: () => Promise<ControlStatus> | ControlStatus
  run: (action: ControlAction) => Promise<void>
}

const ALLOWED_ORIGINS = new Set(['http://127.0.0.1:8999', 'http://localhost:8999'])

export function parseControlRequest(
  method: string,
  url: string,
): { kind: 'status' } | { kind: 'action'; action: ControlAction } | { kind: 'not-found' } | { kind: 'method' } {
  const path = url.split('?')[0] ?? url
  if (path === '/dsh/status') {
    return method === 'GET' || method === 'HEAD' ? { kind: 'status' } : { kind: 'method' }
  }
  if (path === '/dsh/restart') {
    return method === 'POST' ? { kind: 'action', action: 'restart' } : { kind: 'method' }
  }
  if (path === '/dsh/upgrade') {
    return method === 'POST' ? { kind: 'action', action: 'upgrade' } : { kind: 'method' }
  }
  return { kind: 'not-found' }
}

export function isAllowedControlOrigin(origin: string | undefined): boolean {
  if (!origin) {
    return true
  }
  return ALLOWED_ORIGINS.has(origin)
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  res.end(payload)
}

function readBody(req: IncomingMessage): Promise<void> {
  return new Promise((resolve, reject) => {
    req.on('data', () => {
      // Drain so keep-alive clients do not stall. Body is unused.
    })
    req.on('end', resolve)
    req.on('error', reject)
  })
}

export function createControlRequestListener(hooks: ControlServerHooks) {
  let inflight = false
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    try {
      const method = req.method ?? 'GET'
      const url = req.url ?? '/'
      if (!isAllowedControlOrigin(req.headers.origin)) {
        sendJson(res, 403, { ok: false, error: 'forbidden-origin' })
        return
      }

      const parsed = parseControlRequest(method, url)
      if (parsed.kind === 'not-found') {
        sendJson(res, 404, { ok: false, error: 'not-found' })
        return
      }
      if (parsed.kind === 'method') {
        sendJson(res, 405, { ok: false, error: 'method-not-allowed' })
        return
      }

      if (parsed.kind === 'status') {
        const status = await hooks.status()
        sendJson(res, 200, { ok: true, ...status })
        return
      }

      await readBody(req)
      // Reserve the slot before any await: two rapid requests must not both pass.
      if (inflight) {
        sendJson(res, 409, { ok: false, error: 'busy' })
        return
      }
      inflight = true
      try {
        const status = await hooks.status()
        if (!status.local) {
          sendJson(res, 403, { ok: false, error: 'remote-instance' })
          return
        }
        if (hooks.isBusy() || status.busy) {
          sendJson(res, 409, { ok: false, error: 'busy' })
          return
        }

        sendJson(res, 202, { ok: true, accepted: parsed.action })
        void hooks
          .run(parsed.action)
          .catch(() => {
            // Failures surface through the existing host starting/error state.
          })
          .finally(() => {
            inflight = false
          })
      } catch {
        inflight = false
        throw new Error('control action failed to start')
      }
    } catch {
      if (!res.writableEnded) {
        sendJson(res, 500, { ok: false, error: 'internal' })
      }
    }
  }
}

export async function startControlServer(
  hooks: ControlServerHooks,
  opts?: { host?: string; port?: number },
): Promise<{ url: string; server: Server; stop: () => Promise<void> }> {
  const host = opts?.host ?? CONTROL_HOST
  const port = opts?.port ?? CONTROL_PORT
  // Build the listener once so its in-flight guard is shared across requests.
  const listener = createControlRequestListener(hooks)
  const server = createServer((req, res) => {
    void listener(req, res)
  })

  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error): void => {
      server.off('listening', onListening)
      reject(error)
    }
    const onListening = (): void => {
      server.off('error', onError)
      resolve()
    }
    server.once('error', onError)
    server.once('listening', onListening)
    server.listen(port, host)
  })

  return {
    url: `http://${host}:${port}`,
    server,
    stop: () =>
      new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()))
      }),
  }
}
