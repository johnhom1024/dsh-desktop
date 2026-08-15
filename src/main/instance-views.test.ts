import { deepEqual, equal } from 'node:assert/strict'
import { test } from 'node:test'
import { TAB_BAR_HEIGHT, chromeContentBounds, layoutActiveView, shouldShowInstanceView } from './instance-views.js'

test('chromeContentBounds places the view below the tab bar', () => {
  deepEqual(chromeContentBounds({ width: 1280, height: 840 }, TAB_BAR_HEIGHT), {
    x: 0,
    y: TAB_BAR_HEIGHT,
    width: 1280,
    height: 840 - TAB_BAR_HEIGHT,
  })
})

test('chromeContentBounds never returns a negative height', () => {
  deepEqual(chromeContentBounds({ width: 800, height: 20 }, 40), {
    x: 0,
    y: 40,
    width: 800,
    height: 0,
  })
})

test('layoutActiveView only sizes the active view', () => {
  const calls: Record<string, unknown> = {}
  const views = new Map([
    [
      'local-3080',
      {
        setBounds: (bounds: { x: number; y: number; width: number; height: number }) => {
          calls['local-3080'] = bounds
        },
      },
    ],
    [
      'remote-1',
      {
        setBounds: (bounds: { x: number; y: number; width: number; height: number }) => {
          calls['remote-1'] = bounds
        },
      },
    ],
  ])

  layoutActiveView(views, 'remote-1', { width: 1280, height: 840 }, TAB_BAR_HEIGHT)

  equal(calls['local-3080'], undefined)
  deepEqual(calls['remote-1'], {
    x: 0,
    y: TAB_BAR_HEIGHT,
    width: 1280,
    height: 840 - TAB_BAR_HEIGHT,
  })
})

test('layoutActiveView no-ops when the active id is missing', () => {
  let called = 0
  const views = new Map([
    ['local-3080', { setBounds: () => { called += 1 } }],
  ])
  layoutActiveView(views, null, { width: 1280, height: 840 }, TAB_BAR_HEIGHT)
  equal(called, 0)
})

test('shouldShowInstanceView hides the official UI while an overlay is open', () => {
  equal(
    shouldShowInstanceView({ hasUrl: true, instanceId: 'local-3080', activeId: 'local-3080', overlayOpen: false }),
    true,
  )
  equal(
    shouldShowInstanceView({ hasUrl: true, instanceId: 'local-3080', activeId: 'local-3080', overlayOpen: true }),
    false,
  )
  equal(
    shouldShowInstanceView({ hasUrl: false, instanceId: 'local-3080', activeId: 'local-3080', overlayOpen: false }),
    false,
  )
  equal(
    shouldShowInstanceView({ hasUrl: true, instanceId: 'local-3080', activeId: 'remote-1', overlayOpen: false }),
    false,
  )
})
