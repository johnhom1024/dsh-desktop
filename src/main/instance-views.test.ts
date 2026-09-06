import { deepEqual, equal } from 'node:assert/strict'
import { test } from 'node:test'
import {
  SIDEBAR_COLLAPSED_WIDTH,
  SIDEBAR_TOGGLE_MS,
  SIDEBAR_WIDTH,
  chromeContentBounds,
  easeInOut,
  layoutActiveView,
  lerp,
  shouldShowInstanceView,
  sidebarWidthAt,
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

test('easeInOut is 0 at start, 0.5 at mid, 1 at end', () => {
  equal(easeInOut(0), 0)
  equal(easeInOut(0.5), 0.5)
  equal(easeInOut(1), 1)
  equal(easeInOut(-1), 0)
  equal(easeInOut(2), 1)
})

test('lerp interpolates linearly', () => {
  equal(lerp(84, 208, 0), 84)
  equal(lerp(84, 208, 1), 208)
  equal(lerp(84, 208, 0.5), 146)
})

test('sidebarWidthAt stays at the start until time moves, then eases to the end', () => {
  equal(sidebarWidthAt(SIDEBAR_WIDTH, SIDEBAR_COLLAPSED_WIDTH, 0), SIDEBAR_WIDTH)
  equal(sidebarWidthAt(SIDEBAR_WIDTH, SIDEBAR_COLLAPSED_WIDTH, SIDEBAR_TOGGLE_MS), SIDEBAR_COLLAPSED_WIDTH)
  equal(sidebarWidthAt(SIDEBAR_WIDTH, SIDEBAR_COLLAPSED_WIDTH, SIDEBAR_TOGGLE_MS + 40), SIDEBAR_COLLAPSED_WIDTH)
  equal(sidebarWidthAt(SIDEBAR_COLLAPSED_WIDTH, SIDEBAR_WIDTH, SIDEBAR_TOGGLE_MS / 2), 146)
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
