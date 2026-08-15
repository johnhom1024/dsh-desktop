import { deepEqual, equal, match, rejects } from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import {
  looksLikeInteractivePrompt,
  parseHarnessWebUrl,
  startHarnessWeb,
  stopListeningOnPort,
} from './harness-process.js'

test('parseHarnessWebUrl reads the first loopback http url', () => {
  equal(
    parseHarnessWebUrl('starting\nlistening on http://127.0.0.1:41234/\nready'),
    'http://127.0.0.1:41234/',
  )
})

test('parseHarnessWebUrl ignores non-loopback urls', () => {
  equal(parseHarnessWebUrl('open http://example.com:3080'), null)
})

test('looksLikeInteractivePrompt detects pnpm build approval prompts', () => {
  equal(looksLikeInteractivePrompt('Choose which packages to build\n> esbuild'), true)
  equal(looksLikeInteractivePrompt('? Choose the packages to approve builds'), true)
  equal(looksLikeInteractivePrompt('listening on http://127.0.0.1:3080/'), false)
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

test('stop kills grandchild processes started by the spawned command', async () => {
  const stamp = Date.now()
  const serverScript = join(tmpdir(), `fake-dsh-orphan-server-${stamp}.mjs`)
  const parentScript = join(tmpdir(), `fake-dsh-orphan-parent-${stamp}.mjs`)
  await writeFile(
    serverScript,
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
  await writeFile(
    parentScript,
    `
import { spawn } from 'node:child_process'
const child = spawn(process.execPath, [${JSON.stringify(serverScript)}], {
  stdio: ['ignore', 'inherit', 'inherit'],
})
child.on('error', (error) => {
  console.error(error)
  process.exit(1)
})
setInterval(() => {}, 10_000)
`,
    'utf8',
  )

  const started = await startHarnessWeb({
    command: process.execPath,
    args: [parentScript],
    probe: async (url) => {
      const response = await fetch(url)
      const body = await response.text()
      return response.ok && body.includes('DeepSeek Harness')
    },
    timeoutMs: 5000,
  })

  const response = await fetch(started.url)
  equal(response.ok, true)
  await started.stop()

  await new Promise((resolve) => setTimeout(resolve, 200))
  await rejects(() => fetch(started.url, { signal: AbortSignal.timeout(500) }))
})

test('startHarnessWeb forwards stdout and stderr through onOutput', async () => {
  const script = join(tmpdir(), `fake-dsh-log-${Date.now()}.mjs`)
  await writeFile(
    script,
    `
console.log('preparing package')
console.error('downloading tarball')
`,
    'utf8',
  )

  const chunks: string[] = []
  await rejects(
    () =>
      startHarnessWeb({
        command: process.execPath,
        args: [script],
        probe: async () => false,
        timeoutMs: 2000,
        onOutput: (text) => {
          chunks.push(text)
        },
      }),
    /exited before becoming ready/i,
  )

  match(chunks.join(''), /preparing package/)
  match(chunks.join(''), /downloading tarball/)
})

test('stopListeningOnPort signals pids listening on the given port', async () => {
  const calls: string[] = []
  const pids = await stopListeningOnPort(3080, async (command, args) => {
    calls.push([command, ...args].join(' '))
    return calls.length === 1 ? '4242\n' : ''
  })
  deepEqual(pids, [4242])
  equal(calls[0], 'lsof -nP -iTCP:3080 -sTCP:LISTEN -t')
})

test('startHarnessWeb fails fast when the child asks for interactive input', async () => {
  const script = join(tmpdir(), `fake-dsh-prompt-${Date.now()}.mjs`)
  await writeFile(
    script,
    `
console.log('Choose which packages to build')
setInterval(() => {}, 1000)
`,
    'utf8',
  )

  await rejects(
    () =>
      startHarnessWeb({
        command: process.execPath,
        args: [script],
        probe: async () => false,
        timeoutMs: 5000,
      }),
    /等待交互确认/,
  )
})
