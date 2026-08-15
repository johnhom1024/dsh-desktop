import { match } from 'node:assert/strict'
import { test } from 'node:test'
import { desktopIconFile, preloadFile, rendererFile, resolveDesktopIconFile } from './paths.js'

test('preload and renderer files live next to compiled main output', () => {
  match(preloadFile('shell.cjs'), /[/\\]preload[/\\]shell\.cjs$/)
  match(rendererFile('index.html'), /[/\\]renderer[/\\]index\.html$/)
  match(desktopIconFile(), /[/\\]build[/\\]icon\.png$/)
})

test('resolveDesktopIconFile picks the first existing candidate', () => {
  const found = resolveDesktopIconFile((file) => file.endsWith('icon.png'), [
    '/missing/icon.icns',
    '/repo/build/icon.png',
  ])
  match(found ?? '', /icon\.png$/)
})
