import { deepEqual, equal } from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { launchSpecFor } from './launch.js'

test('reuse-local and remote only return a url', () => {
  deepEqual(launchSpecFor({ kind: 'reuse-local', url: 'http://127.0.0.1:3080' }), {
    kind: 'url',
    url: 'http://127.0.0.1:3080',
  })
  deepEqual(launchSpecFor({ kind: 'remote', url: 'http://192.168.31.229:3080' }), {
    kind: 'url',
    url: 'http://192.168.31.229:3080',
  })
})

test('path-dsh spawns the binary with web --port 0', () => {
  deepEqual(launchSpecFor({ kind: 'path-dsh', command: '/usr/local/bin/dsh' }), {
    kind: 'spawn',
    command: '/usr/local/bin/dsh',
    args: ['web', '--port', '0'],
  })
})

test('package sources spawn the package bin with web --port 0', async () => {
  const packageRoot = join(await mkdtemp(join(tmpdir(), 'dsh-bin-')), 'pkg')
  await mkdir(packageRoot, { recursive: true })
  await writeFile(
    join(packageRoot, 'package.json'),
    JSON.stringify({
      name: '@deepseek-ai/dsh',
      version: '0.1.0-rc.6',
      bin: { dsh: 'lib/bin.js' },
    }),
    'utf8',
  )

  const spec = launchSpecFor({
    kind: 'pnpm-dlx',
    packageRoot,
    version: '0.1.0-rc.6',
  })

  equal(spec.kind, 'spawn')
  if (spec.kind === 'spawn') {
    equal(spec.command, process.execPath)
    deepEqual(spec.args, [join(packageRoot, 'lib/bin.js'), 'web', '--port', '0'])
  }
})

test('none has no launch spec', () => {
  deepEqual(launchSpecFor({ kind: 'none' }), { kind: 'none' })
})
