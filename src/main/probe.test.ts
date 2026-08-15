import { equal } from 'node:assert/strict'
import { createServer, type Server } from 'node:http'
import { after, test } from 'node:test'
import { probeHarnessWeb } from './probe.js'

function listen(server: Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (address && typeof address === 'object') {
        resolve(address.port)
        return
      }
      reject(new Error('server did not bind a port'))
    })
    server.on('error', reject)
  })
}

const servers: Server[] = []

after(async () => {
  await Promise.all(
    servers.map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()))
        }),
    ),
  )
})

test('probeHarnessWeb returns true for official DeepSeek Harness html', async () => {
  const server = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    res.end('<!doctype html><title>DeepSeek Harness</title>')
  })
  servers.push(server)
  const port = await listen(server)

  const found = await probeHarnessWeb(`http://127.0.0.1:${port}/`)

  equal(found, true)
})

test('probeHarnessWeb returns false for unrelated html', async () => {
  const server = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain' })
    res.end('ok')
  })
  servers.push(server)
  const port = await listen(server)

  const found = await probeHarnessWeb(`http://127.0.0.1:${port}/`)

  equal(found, false)
})

test('probeHarnessWeb returns false when nothing is listening', async () => {
  const found = await probeHarnessWeb('http://127.0.0.1:1/', 200)

  equal(found, false)
})
