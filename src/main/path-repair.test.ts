import { deepEqual, equal } from 'node:assert/strict'
import { test } from 'node:test'
import {
  candidatePathDirs,
  extractPathAssignments,
  mergePath,
} from './path-repair.js'

test('mergePath prepends missing dirs and keeps the original tail', () => {
  equal(
    mergePath('/usr/bin:/bin', ['/opt/homebrew/bin', '/usr/bin', '/Users/me/Library/pnpm']),
    '/opt/homebrew/bin:/Users/me/Library/pnpm:/usr/bin:/bin',
  )
})

test('mergePath ignores empty entries', () => {
  equal(mergePath('/usr/bin', ['', '/opt/homebrew/bin']), '/opt/homebrew/bin:/usr/bin')
})

test('candidatePathDirs lists Homebrew and pnpm homes for this user', () => {
  const dirs = candidatePathDirs('/Users/johnhom')
  deepEqual(dirs, [
    '/opt/homebrew/bin',
    '/usr/local/bin',
    '/Users/johnhom/Library/pnpm',
    '/Users/johnhom/.local/share/pnpm',
  ])
})

test('extractPathAssignments reads export PATH lines without executing the file', () => {
  const text = `
export HOMEBREW_PREFIX="/opt/homebrew"
export PATH="/opt/homebrew/bin:$PATH"
PATH="$HOME/Library/pnpm:$PATH"
# export PATH="/tmp/ignored:$PATH"
`
  const parts = extractPathAssignments(text, '/Users/johnhom')
  deepEqual(parts, ['/opt/homebrew/bin', '/Users/johnhom/Library/pnpm'])
})
