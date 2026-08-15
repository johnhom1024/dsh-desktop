import { equal } from 'node:assert/strict'
import { test } from 'node:test'
import { isHostPage } from './host-page.js'

test('isHostPage accepts the Vite dev server url', () => {
  equal(isHostPage('http://127.0.0.1:5173/', 'http://127.0.0.1:5173/'), true)
  equal(isHostPage('http://127.0.0.1:5173', 'http://127.0.0.1:5173/'), true)
})

test('isHostPage accepts a packaged file index.html', () => {
  equal(isHostPage('file:///tmp/app/dist/renderer/index.html'), true)
})

test('isHostPage rejects an official harness url', () => {
  equal(isHostPage('http://127.0.0.1:3080/', 'http://127.0.0.1:5173/'), false)
})
