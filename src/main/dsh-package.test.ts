import { deepEqual, equal } from 'node:assert/strict'
import { realpathSync } from 'node:fs'
import { mkdtemp, mkdir, symlink, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import {
  findNpxCachedDsh,
  findPnpmDlxCachedDsh,
  readDshPackage,
} from './dsh-package.js'

async function writePackage(dir: string, name: string, version: string): Promise<void> {
  await mkdir(dir, { recursive: true })
  await writeFile(
    join(dir, 'package.json'),
    JSON.stringify({ name, version }),
    'utf8',
  )
}

test('readDshPackage returns version when name is @deepseek-ai/dsh', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-pkg-'))
  await writePackage(root, '@deepseek-ai/dsh', '0.1.0-rc.6')

  deepEqual(readDshPackage(root), { version: '0.1.0-rc.6' })
})

test('readDshPackage returns null when name does not match', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-pkg-'))
  await writePackage(root, 'left-pad', '1.0.0')

  equal(readDshPackage(root), null)
})

test('readDshPackage returns null when package.json is missing', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-pkg-'))

  equal(readDshPackage(root), null)
})

test('findPnpmDlxCachedDsh reads the pkg symlink layout used by pnpm dlx', async () => {
  const dlxRoot = await mkdtemp(join(tmpdir(), 'pnpm-dlx-'))
  const hashDir = join(dlxRoot, '3c4844e13d36df0eba45e0bceb531646')
  const installDir = join(hashDir, 'msrq1um6-93n')
  const packageRoot = join(installDir, 'node_modules', '@deepseek-ai', 'dsh')
  await writePackage(packageRoot, '@deepseek-ai/dsh', '0.1.0-rc.6')
  await symlink(installDir, join(hashDir, 'pkg'))

  deepEqual(findPnpmDlxCachedDsh(dlxRoot), {
    packageRoot: realpathSync(packageRoot),
    version: '0.1.0-rc.6',
  })
})

test('findPnpmDlxCachedDsh prefers the newest cached install', async () => {
  const dlxRoot = await mkdtemp(join(tmpdir(), 'pnpm-dlx-'))
  const olderRoot = join(dlxRoot, 'old', 'a', 'node_modules', '@deepseek-ai', 'dsh')
  const newerRoot = join(dlxRoot, 'new', 'b', 'node_modules', '@deepseek-ai', 'dsh')
  await writePackage(olderRoot, '@deepseek-ai/dsh', '0.1.0-rc.5')
  await writePackage(newerRoot, '@deepseek-ai/dsh', '0.1.0-rc.6')
  const past = new Date('2026-01-01T00:00:00Z')
  const recent = new Date('2026-08-15T00:00:00Z')
  await utimes(olderRoot, past, past)
  await utimes(newerRoot, recent, recent)

  deepEqual(findPnpmDlxCachedDsh(dlxRoot), {
    packageRoot: realpathSync(newerRoot),
    version: '0.1.0-rc.6',
  })
})

test('findPnpmDlxCachedDsh returns null when dlx cache is empty', async () => {
  const dlxRoot = await mkdtemp(join(tmpdir(), 'pnpm-dlx-'))

  equal(findPnpmDlxCachedDsh(dlxRoot), null)
})

test('findNpxCachedDsh reads a cached @deepseek-ai/dsh package', async () => {
  const npxRoot = await mkdtemp(join(tmpdir(), 'npx-'))
  const packageRoot = join(npxRoot, 'abc', 'node_modules', '@deepseek-ai', 'dsh')
  await writePackage(packageRoot, '@deepseek-ai/dsh', '0.1.0-rc.6')

  deepEqual(findNpxCachedDsh(npxRoot), {
    packageRoot: realpathSync(packageRoot),
    version: '0.1.0-rc.6',
  })
})

test('findNpxCachedDsh ignores packages that are not @deepseek-ai/dsh', async () => {
  const npxRoot = await mkdtemp(join(tmpdir(), 'npx-'))
  await writePackage(join(npxRoot, 'abc', 'node_modules', 'other'), 'other', '1.0.0')

  equal(findNpxCachedDsh(npxRoot), null)
})
