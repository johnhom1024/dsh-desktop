import { deepEqual, equal } from 'node:assert/strict'
import { test } from 'node:test'
import {
  SIDEBAR_COLLAPSED_WIDTH,
  SIDEBAR_WIDTH,
  chromeContentBounds,
  layoutActiveView,
  shouldShowInstanceView,
  sidebarWidthFor,
} from './instance-views.js'

test('chromeContentBounds places the view right of the sidebar, top to bottom', () => {
  deepEqual(chromeContentBounds({ width: 1280, height: 840 }), {
    x: SIDEBAR_WIDTH,
    y: 0,
    width: 1280 - SIDEBAR_WIDTH,
    height: 840,
  })
})

test('chromeContentBounds uses the collapsed rail width when collapsed', () => {
  deepEqual(chromeContentBounds({ width: 1280, height: 840 }, SIDEBAR_COLLAPSED_WIDTH), {
    x: SIDEBAR_COLLAPSED_WIDTH,
    y: 0,
    width: 1280 - SIDEBAR_COLLAPSED_WIDTH,
    height: 840,
  })
})

test('sidebarWidthFor maps state to rail width', () => {
  equal(sidebarWidthFor(false), SIDEBAR_WIDTH)
  equal(sidebarWidthFor(true), SIDEBAR_COLLAPSED_WIDTH)
})

test('chromeContentBounds keeps a zero-width view when the window is narrower than the sidebar', () => {
  deepEqual(chromeContentBounds({ width: 180, height: 400 }), {
    x: 180,
    y: 0,
    width: 0,
    height: 400,
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

  layoutActiveView(views, 'remote-1', { width: 1280, height: 840 })

  equal(calls['local-3080'], undefined)
  deepEqual(calls['remote-1'], {
    x: SIDEBAR_WIDTH,
    y: 0,
    width: 1280 - SIDEBAR_WIDTH,
    height: 840,
  })
})

test('layoutActiveView no-ops when the active id is missing', () => {
  let called = 0
  const views = new Map([
    ['local-3080', { setBounds: () => { called += 1 } }],
  ])
  layoutActiveView(views, null, { width: 1280, height: 840 })
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
