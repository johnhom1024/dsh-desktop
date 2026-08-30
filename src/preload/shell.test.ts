import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
import { test } from 'node:test'

const dir = dirname(fileURLToPath(import.meta.url))
const cjs = readFileSync(join(dir, 'shell.cjs'), 'utf8')
const ts = readFileSync(join(dir, 'shell.ts'), 'utf8')

// `key: (…) => ipcRenderer.invoke('channel')` — both files use the same shape.
function exposedKeys(source: string): Map<string, string> {
  const map = new Map<string, string>()
  // Matches `key: (args) => …` (shell.cjs) and `key: (args): Promise<T> => …` (shell.ts).
  const re = /^\s{2}(\w+):\s*\(.*?\)(?::\s*[^=]+)?\s*=>\s*ipcRenderer\.invoke\('([^']+)'/gm
  for (const match of source.matchAll(re)) {
    map.set(match[1], match[2])
  }
  return map
}

test('preload shell.cjs exposes the same API surface as shell.ts', () => {
  const cjsKeys = exposedKeys(cjs)
  const tsKeys = exposedKeys(ts)
  assert.ok(cjsKeys.size > 0, 'failed to parse shell.cjs; update the test regex')
  assert.ok(tsKeys.size > 0, 'failed to parse shell.ts; update the test regex')
  assert.deepEqual(
    [...cjsKeys.keys()].sort(),
    [...tsKeys.keys()].sort(),
    'shell.cjs is the shipped preload and must mirror every method in shell.ts (channels too)',
  )
  for (const [key, channel] of cjsKeys) {
    assert.equal(tsKeys.get(key), channel, `channel mismatch for ${key}`)
  }
})
