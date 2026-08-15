import { match } from 'node:assert/strict'
import { test } from 'node:test'
import { preloadFile, rendererFile } from './paths.js'

test('preload and renderer files live next to compiled main output', () => {
  match(preloadFile('shell.cjs'), /[/\\]preload[/\\]shell\.cjs$/)
  match(rendererFile('shell.html'), /[/\\]renderer[/\\]shell\.html$/)
  match(rendererFile('settings.html'), /[/\\]renderer[/\\]settings\.html$/)
})
