import { deepEqual, equal, match, rejects } from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { parseHarnessWebUrl, startHarnessWeb } from './harness-process.js'

test('parseHarnessWebUrl reads the first loopback http url', () => {
  equal(
    parseHarnessWebUrl('starting\nlistening on http://127.0.0.1:41234/\nready'),
    'http://127.0.0.1:41234/',
  )
})

test('parseHarnessWebUrl ignores non-loopback urls', () => {
  equal(parseHarnessWebUrl('open http://example.com:3080'), null)
})

test('startHarnessWeb waits until the printed url is ready', async () => {
  const script = join(tmpdir(), `fake-dsh-web-${Date.now()}.mjs`)
  await writeFile(
    script,
    `
import { createServer } from 'node:http'
const server = createServer((_req, res) => {
  res.writeHead(200, { 'content-type': 'text/html' })
  res.end('<title>DeepSeek Harness</title>')
})
server.listen(0, '127.0.0.1', () => {
  const { port } = server.address()
  console.log('listening on http://127.0.0.1:' + port + '/')
})
`,
    'utf8',
  )

  const started = await startHarnessWeb({
    command: process.execPath,
    args: [script],
    probe: async (url) => {
      const response = await fetch(url)
      const body = await response.text()
      return response.ok && body.includes('DeepSeek Harness')
    },
    timeoutMs: 5000,
  })

  match(started.url, /^http:\/\/127\.0\.0\.1:\d+\/$/)
  const response = await fetch(started.url)
  equal(response.ok, true)
  await started.stop()
})

test('startHarnessWeb stops the child and throws when the url never appears', async () => {
  const script = join(tmpdir(), `fake-dsh-silent-${Date.now()}.mjs`)
  await writeFile(script, 'setInterval(() => {}, 1000)\n', 'utf8')

  await rejects(
    () =>
      startHarnessWeb({
        command: process.execPath,
        args: [script],
        probe: async () => false,
        timeoutMs: 200,
      }),
    /did not print a loopback url/i,
  )
})
