import { deepEqual, equal } from 'node:assert/strict'
import { test } from 'node:test'
import { detectPackageManagers, type PackageManagerId } from './package-managers.js'

function lookupFrom(map: Partial<Record<string, string>>) {
  return async (bin: string): Promise<string | null> => map[bin] ?? null
}

test('detectPackageManagers returns pnpm first when several managers exist', async () => {
  const found = await detectPackageManagers(
    lookupFrom({
      bunx: '/opt/homebrew/bin/bunx',
      npx: '/usr/local/bin/npx',
      pnpm: '/Users/me/Library/pnpm/pnpm',
      yarn: '/opt/homebrew/bin/yarn',
    }),
  )

  deepEqual(
    found.map((item) => item.id),
    ['pnpm', 'npm', 'yarn', 'bun'],
  )
  equal(found[0]?.preview, 'pnpm --config.dangerouslyAllowAllBuilds=true dlx @deepseek-ai/dsh@latest web --no-open --port 3080')
  equal(found[1]?.preview, 'npx -y @deepseek-ai/dsh@latest web --no-open --port 3080')
  equal(found[0]?.commandPath, '/Users/me/Library/pnpm/pnpm')
  deepEqual(found[0]?.args, [
    '--config.dangerouslyAllowAllBuilds=true',
    'dlx',
    '@deepseek-ai/dsh@latest',
    'web',
    '--no-open',
    '--port',
    '3080',
  ])
})

test('detectPackageManagers maps npm to npx -y', async () => {
  const found = await detectPackageManagers(lookupFrom({ npx: '/usr/bin/npx' }))
  equal(found.length, 1)
  equal(found[0]?.id, 'npm')
  equal(found[0]?.commandPath, '/usr/bin/npx')
  deepEqual(found[0]?.args, ['-y', '@deepseek-ai/dsh@latest', 'web', '--no-open', '--port', '3080'])
})

test('detectPackageManagers ignores managers that are not on PATH', async () => {
  const found = await detectPackageManagers(lookupFrom({ yarn: '/opt/homebrew/bin/yarn' }))
  const ids: PackageManagerId[] = found.map((item) => item.id)
  deepEqual(ids, ['yarn'])
  equal(found[0]?.preview, 'yarn dlx @deepseek-ai/dsh@latest web --no-open --port 3080')
})

test('detectPackageManagers returns an empty list when nothing is installed', async () => {
  deepEqual(await detectPackageManagers(lookupFrom({})), [])
})

test('detectPackageManagers uses the saved local port instead of 0', async () => {
  const found = await detectPackageManagers(lookupFrom({ pnpm: '/opt/homebrew/bin/pnpm' }), 18080)
  equal(found[0]?.preview, 'pnpm --config.dangerouslyAllowAllBuilds=true dlx @deepseek-ai/dsh@latest web --no-open --port 18080')
  deepEqual(found[0]?.args, [
    '--config.dangerouslyAllowAllBuilds=true',
    'dlx',
    '@deepseek-ai/dsh@latest',
    'web',
    '--no-open',
    '--port',
    '18080',
  ])
})
