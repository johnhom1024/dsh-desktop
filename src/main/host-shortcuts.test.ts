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

test('Cmd+R reloads the focused view', () => {
  equal(
    hostShortcutFor({ ...keyDown, key: 'r', meta: true }, { isMac: true, isDev: true }),
    'reload-view',
  )
  equal(
    hostShortcutFor({ ...keyDown, key: 'R', meta: true, shift: true }, { isMac: true, isDev: true }),
    'reload-view',
  )
  equal(
    hostShortcutFor({ ...keyDown, key: 'r', control: true }, { isMac: false, isDev: false }),
    'reload-view',
  )
})

test('Cmd+, opens settings', () => {
  equal(
    hostShortcutFor({ ...keyDown, key: ',', meta: true }, { isMac: true, isDev: true }),
    'open-settings',
  )
})

test('Cmd+\\ toggles the sidebar', () => {
  equal(
    hostShortcutFor({ ...keyDown, key: '\\', meta: true }, { isMac: true, isDev: true }),
    'toggle-sidebar',
  )
  equal(
    hostShortcutFor({ ...keyDown, key: '\\', control: true }, { isMac: false, isDev: false }),
    'toggle-sidebar',
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

test('Cmd+Q quits the app', () => {
  equal(hostShortcutFor({ ...keyDown, key: 'q', meta: true }, { isMac: true, isDev: true }), 'quit')
  equal(
    hostShortcutFor({ ...keyDown, key: 'q', control: true }, { isMac: false, isDev: false }),
    'quit',
  )
})
