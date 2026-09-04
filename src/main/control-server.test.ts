import { deepEqual, equal, match } from 'node:assert/strict'
import { after, test } from 'node:test'
import {
  CONTROL_HOST,
  CONTROL_PORT,
  isAllowedControlOrigin,
  parseControlRequest,
  startControlServer,
} from './control-server.js'

test('parseControlRequest maps status, restart and upgrade', () => {
  deepEqual(parseControlRequest('GET', '/dsh/status'), { kind: 'status' })
  deepEqual(parseControlRequest('HEAD', '/dsh/status?x=1'), { kind: 'status' })
  deepEqual(parseControlRequest('POST', '/dsh/restart'), { kind: 'action', action: 'restart' })
  deepEqual(parseControlRequest('POST', '/dsh/upgrade'), { kind: 'action', action: 'upgrade' })
})

test('parseControlRequest rejects the wrong method and unknown paths', () => {
  deepEqual(parseControlRequest('GET', '/dsh/upgrade'), { kind: 'method' })
  deepEqual(parseControlRequest('POST', '/dsh/status'), { kind: 'method' })
  deepEqual(parseControlRequest('GET', '/dsh/upgrade?force=1'), { kind: 'method' })
  deepEqual(parseControlRequest('POST', '/dsh/stop'), { kind: 'not-found' })
})

test('isAllowedControlOrigin allows missing origin and loopback pages', () => {
  equal(isAllowedControlOrigin(undefined), true)
  equal(isAllowedControlOrigin('http://127.0.0.1:8999'), true)
  equal(isAllowedControlOrigin('https://example.com'), false)
})

const servers: Array<{ stop: () => Promise<void> }> = []

after(async () => {
  await Promise.all(servers.map((item) => item.stop()))
})

async function listen(hooks: Parameters<typeof startControlServer>[0]) {
  const started = await startControlServer(hooks, { port: 0 })
  servers.push(started)
  const address = started.server.address()
  if (!address || typeof address === 'string') {
    throw new Error('control server did not bind a port')
  }
  return { ...started, port: address.port }
}

test('GET /dsh/status returns the current host snapshot', async () => {
  const { port } = await listen({
    isBusy: () => false,
    status: () => ({ local: true, busy: false, dshVersion: '0.1.2', localPort: 3080 }),
    run: async () => {
      throw new Error('should not run')
    },
  })

  const response = await fetch(`http://127.0.0.1:${port}/dsh/status`)
  equal(response.status, 200)
  deepEqual(await response.json(), {
    ok: true,
    local: true,
    busy: false,
    dshVersion: '0.1.2',
    localPort: 3080,
  })
})

test('POST /dsh/upgrade accepts locally and runs in the background', async () => {
  let resolveRun: (() => void) | undefined
  const ran = new Promise<string>((resolve) => {
    resolveRun = () => resolve('upgrade')
  })
  const { port } = await listen({
    isBusy: () => false,
    status: () => ({ local: true, busy: false, dshVersion: '0.1.2', localPort: 3080 }),
    run: async (action) => {
      equal(action, 'upgrade')
      resolveRun?.()
    },
  })

  const response = await fetch(`http://127.0.0.1:${port}/dsh/upgrade`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  })
  equal(response.status, 202)
  deepEqual(await response.json(), { ok: true, accepted: 'upgrade' })
  equal(await ran, 'upgrade')
})

test('POST /dsh/restart rejects a remote instance', async () => {
  const { port } = await listen({
    isBusy: () => false,
    status: () => ({ local: false, busy: false, dshVersion: null, localPort: 3080 }),
    run: async () => {
      throw new Error('should not run')
    },
  })

  const response = await fetch(`http://127.0.0.1:${port}/dsh/restart`, { method: 'POST' })
  equal(response.status, 403)
  deepEqual(await response.json(), { ok: false, error: 'remote-instance' })
})

test('a second POST /dsh/upgrade is 409 while the first run is still in flight', async () => {
  let release: (() => void) | undefined
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  const { port } = await listen({
    isBusy: () => false,
    status: () => ({ local: true, busy: false, dshVersion: '0.1.2', localPort: 3080 }),
    run: async () => held,
  })

  const first = await fetch(`http://127.0.0.1:${port}/dsh/upgrade`, { method: 'POST' })
  equal(first.status, 202)
  const second = await fetch(`http://127.0.0.1:${port}/dsh/upgrade`, { method: 'POST' })
  equal(second.status, 409)
  release?.()
})

test('POST /dsh/upgrade returns 409 while the host is busy', async () => {
  const { port } = await listen({
    isBusy: () => true,
    status: () => ({ local: true, busy: true, dshVersion: '0.1.2', localPort: 3080 }),
    run: async () => {
      throw new Error('should not run')
    },
  })

  const response = await fetch(`http://127.0.0.1:${port}/dsh/upgrade`, { method: 'POST' })
  equal(response.status, 409)
  deepEqual(await response.json(), { ok: false, error: 'busy' })
})

test('GET /dsh/upgrade is rejected so a page cannot trigger an update', async () => {
  const { port } = await listen({
    isBusy: () => false,
    status: () => ({ local: true, busy: false, dshVersion: '0.1.2', localPort: 3080 }),
    run: async () => {
      throw new Error('should not run')
    },
  })

  const response = await fetch(`http://127.0.0.1:${port}/dsh/upgrade`)
  equal(response.status, 405)
})

test('foreign Origin is rejected', async () => {
  const { port } = await listen({
    isBusy: () => false,
    status: () => ({ local: true, busy: false, dshVersion: '0.1.2', localPort: 3080 }),
    run: async () => {
      throw new Error('should not run')
    },
  })

  const response = await fetch(`http://127.0.0.1:${port}/dsh/upgrade`, {
    method: 'POST',
    headers: { origin: 'https://example.com' },
  })
  equal(response.status, 403)
  deepEqual(await response.json(), { ok: false, error: 'forbidden-origin' })
})

test('control server constants stay on loopback 8999', () => {
  equal(CONTROL_HOST, '127.0.0.1')
  equal(CONTROL_PORT, 8999)
  match(`http://${CONTROL_HOST}:${CONTROL_PORT}/dsh/upgrade`, /^http:\/\/127\.0\.0\.1:8999\/dsh\/upgrade$/)
})
