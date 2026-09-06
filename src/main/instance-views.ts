export const TAB_BAR_HEIGHT = 44

// Vertical sidebar chrome (Arc style, no top strip): host HTML owns the left
// rail; the official WebContentsView starts to its right and reaches the top
// edge of the window.
export const SIDEBAR_WIDTH = 208

// Collapsed rail: tabs keep only their icons (a colored dot per instance,
// gear, theme glyph). Wide enough that the traffic-light buttons — which stay
// put at x=16, ending at x≈69 — never collide with the toggle button below.
export const SIDEBAR_COLLAPSED_WIDTH = 84

// Collapse / expand duration shared by the host rail CSS and the native
// WebContentsView. Keep them in lockstep so the official page never leaves a
// gap or covers the rail mid-animation.
export const SIDEBAR_TOGGLE_MS = 220

// Helper for choosing the rail width from persisted state.
export function sidebarWidthFor(collapsed: boolean): number {
  return collapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_WIDTH
}

export function clamp01(value: number): number {
  if (value <= 0) {
    return 0
  }
  if (value >= 1) {
    return 1
  }
  return value
}

export function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t
}

// Smoothstep (3t² − 2t³). Close enough to CSS `ease-in-out` for a 124px
// travel that the rail and the official view stay visually locked.
export function easeInOut(t: number): number {
  const x = clamp01(t)
  return x * x * (3 - 2 * x)
}

export function sidebarWidthAt(from: number, to: number, elapsedMs: number, durationMs = SIDEBAR_TOGGLE_MS): number {
  if (durationMs <= 0 || elapsedMs >= durationMs) {
    return to
  }
  if (elapsedMs <= 0) {
    return from
  }
  return lerp(from, to, easeInOut(elapsedMs / durationMs))
}

export type ViewBounds = {
  x: number
  y: number
  width: number
  height: number
}

export function chromeContentBounds(
  windowBounds: { width: number; height: number },
  sidebarWidth: number = SIDEBAR_WIDTH,
): ViewBounds {
  const left = Math.min(sidebarWidth, Math.max(0, windowBounds.width))
  return {
    x: left,
    y: 0,
    width: Math.max(0, windowBounds.width - left),
    height: Math.max(0, windowBounds.height),
  }
}

export function layoutActiveView(
  views: Map<string, { setBounds: (bounds: ViewBounds) => void }>,
  activeId: string | null,
  windowBounds: { width: number; height: number },
  opts?: { sidebarWidth?: number },
): void {
  if (!activeId) {
    return
  }
  const view = views.get(activeId)
  if (!view) {
    return
  }
  view.setBounds(chromeContentBounds(windowBounds, opts?.sidebarWidth))
}

export function shouldShowInstanceView(input: {
  hasUrl: boolean
  instanceId: string
  activeId: string | null
  overlayOpen: boolean
}): boolean {
  return input.hasUrl && !input.overlayOpen && input.instanceId === input.activeId
}
