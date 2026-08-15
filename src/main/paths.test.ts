import { match } from 'node:assert/strict'
import { test } from 'node:test'
import { desktopIconFile, preloadFile, rendererFile } from './paths.js'

test('preload and renderer files live next to compiled main output', () => {
  match(preloadFile('shell.cjs'), /[/\\]preload[/\\]shell\.cjs$/)
  match(rendererFile('index.html'), /[/\\]renderer[/\\]index\.html$/)
  match(desktopIconFile(), /[/\\]build[/\\]icon\.png$/)
})
