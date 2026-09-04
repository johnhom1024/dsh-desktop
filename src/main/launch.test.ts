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

test('path-dsh spawns the binary with web --port 3080', () => {
  deepEqual(launchSpecFor({ kind: 'path-dsh', command: '/usr/local/bin/dsh' }), {
    kind: 'spawn',
    command: '/usr/local/bin/dsh',
    args: ['web', '--no-open', '--port', '3080'],
  })
})

test('launchSpecFor uses a custom local port', () => {
  deepEqual(launchSpecFor({ kind: 'path-dsh', command: '/usr/local/bin/dsh' }, undefined, 18080), {
    kind: 'spawn',
    command: '/usr/local/bin/dsh',
    args: ['web', '--no-open', '--port', '18080'],
  })
})

function lookupFrom(bins: Record<string, string>) {
  return (bin: string) => bins[bin] ?? null
}

test('pnpm-dlx launches via pnpm dlx instead of Electron execPath', () => {
  const spec = launchSpecFor(
    {
      kind: 'pnpm-dlx',
      packageRoot: '/pnpm/dlx/dsh',
      version: '0.1.0-rc.6',
    },
    lookupFrom({ pnpm: '/opt/homebrew/bin/pnpm' }),
  )

  deepEqual(spec, {
    kind: 'spawn',
    command: '/opt/homebrew/bin/pnpm',
    args: ['--config.dangerouslyAllowAllBuilds=true', 'dlx', '@deepseek-ai/dsh@latest', 'web', '--no-open', '--port', '3080'],
  })
})

test('npx-cache launches via npx instead of Electron execPath', () => {
  const spec = launchSpecFor(
    {
      kind: 'npx-cache',
      packageRoot: '/npx/dsh',
      version: '0.1.0-rc.6',
    },
    lookupFrom({ npx: '/usr/local/bin/npx' }),
  )

  deepEqual(spec, {
    kind: 'spawn',
    command: '/usr/local/bin/npx',
    args: ['-y', '@deepseek-ai/dsh@latest', 'web', '--no-open', '--port', '3080'],
  })
})

test('bundled package runs the package bin with a Node executable, not Electron', async () => {
  const packageRoot = join(await mkdtemp(join(tmpdir(), 'dsh-bundled-')), 'pkg')
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

  const spec = launchSpecFor(
    {
      kind: 'bundled',
      packageRoot,
      version: '0.1.0-rc.6',
    },
    lookupFrom({ node: '/usr/local/bin/node' }),
  )

  equal(spec.kind, 'spawn')
  if (spec.kind === 'spawn') {
    equal(spec.command.includes('Electron'), false)
    deepEqual(spec.args, [join(packageRoot, 'lib/bin.js'), 'web', '--no-open', '--port', '3080'])
  }
})

test('pnpm-dlx returns none when pnpm is missing', () => {
  deepEqual(
    launchSpecFor(
      { kind: 'pnpm-dlx', packageRoot: '/pnpm/dlx/dsh', version: '0.1.0-rc.6' },
      lookupFrom({}),
    ),
    { kind: 'none' },
  )
})

test('none has no launch spec', () => {
  deepEqual(launchSpecFor({ kind: 'none' }), { kind: 'none' })
})
