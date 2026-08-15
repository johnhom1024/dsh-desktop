import { deepEqual, equal, match } from 'node:assert/strict'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { appendHostLog, clampWindowBounds, formatTrayStatus } from './host-state.js'

test('clampWindowBounds keeps a usable size on the saved origin', () => {
  deepEqual(clampWindowBounds({ x: 12, y: 24, width: 80, height: 40 }), {
    x: 12,
    y: 24,
    width: 800,
    height: 600,
  })
})

test('formatTrayStatus names the current source and url', () => {
  equal(formatTrayStatus({ kind: 'none' }, null), '未连接')
  equal(
    formatTrayStatus({ kind: 'reuse-local', url: 'http://127.0.0.1:3080' }, 'http://127.0.0.1:3080'),
    '已连接 · 本机 3080',
  )
  equal(
    formatTrayStatus({ kind: 'remote', url: 'http://192.168.31.229:3080' }, 'http://192.168.31.229:3080'),
    '已连接 · 远程 192.168.31.229:3080',
  )
})

test('appendHostLog writes a timestamped line', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-log-'))
  appendHostLog(dir, 'shell.log', 'started')
  const text = await readFile(join(dir, 'shell.log'), 'utf8')
  match(text, /started/)
  match(text, /\[\d{4}-\d{2}-\d{2}T/)
})
