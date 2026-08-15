import { equal } from 'node:assert/strict'
import { test } from 'node:test'
import { hostShortcutFor } from './host-shortcuts.js'

const keyDown = {
  type: 'keyDown',
  key: 'r',
  meta: false,
  control: false,
  alt: false,
  shift: false,
}

test('dev Cmd+R reloads the host instead of the official page', () => {
  equal(
    hostShortcutFor({ ...keyDown, key: 'r', meta: true }, { isMac: true, isDev: true }),
    'reload-host',
  )
})

test('dev Cmd+Shift+R still reconnects', () => {
  equal(
    hostShortcutFor({ ...keyDown, key: 'R', meta: true, shift: true }, { isMac: true, isDev: true }),
    'reconnect',
  )
})

test('packaged Cmd+R reconnects and is not a page reload', () => {
  equal(
    hostShortcutFor({ ...keyDown, key: 'r', meta: true }, { isMac: true, isDev: false }),
    'reconnect',
  )
})

test('Windows Ctrl+R follows the same split', () => {
  equal(
    hostShortcutFor({ ...keyDown, key: 'r', control: true }, { isMac: false, isDev: true }),
    'reload-host',
  )
  equal(
    hostShortcutFor({ ...keyDown, key: 'r', control: true }, { isMac: false, isDev: false }),
    'reconnect',
  )
})

test('Cmd+, opens settings', () => {
  equal(
    hostShortcutFor({ ...keyDown, key: ',', meta: true }, { isMac: true, isDev: true }),
    'open-settings',
  )
})

test('plain R and keyUp are ignored', () => {
  equal(hostShortcutFor(keyDown, { isMac: true, isDev: true }), null)
  equal(
    hostShortcutFor({ ...keyDown, type: 'keyUp', meta: true }, { isMac: true, isDev: true }),
    null,
  )
})

test('Chrome-style shortcuts toggle DevTools for the current page', () => {
  equal(
    hostShortcutFor({ ...keyDown, key: 'i', meta: true, alt: true }, { isMac: true, isDev: true }),
    'toggle-devtools',
  )
  equal(
    hostShortcutFor({ ...keyDown, key: 'j', meta: true, alt: true }, { isMac: true, isDev: false }),
    'toggle-devtools',
  )
  equal(
    hostShortcutFor({ ...keyDown, key: 'i', control: true, shift: true }, { isMac: false, isDev: true }),
    'toggle-devtools',
  )
  equal(hostShortcutFor({ ...keyDown, key: 'F12' }, { isMac: true, isDev: false }), 'toggle-devtools')
})

test('Cmd+I without Option is not DevTools', () => {
  equal(
    hostShortcutFor({ ...keyDown, key: 'i', meta: true }, { isMac: true, isDev: true }),
    null,
  )
})
