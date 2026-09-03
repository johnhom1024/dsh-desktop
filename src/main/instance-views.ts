export const TAB_BAR_HEIGHT = 44

// Vertical sidebar chrome (Arc style, no top strip): host HTML owns the left
// rail; the official WebContentsView starts to its right and reaches the top
// edge of the window.
export const SIDEBAR_WIDTH = 208

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
): void {
  if (!activeId) {
    return
  }
  const view = views.get(activeId)
  if (!view) {
    return
  }
  view.setBounds(chromeContentBounds(windowBounds))
}

export function shouldShowInstanceView(input: {
  hasUrl: boolean
  instanceId: string
  activeId: string | null
  overlayOpen: boolean
}): boolean {
  return input.hasUrl && !input.overlayOpen && input.instanceId === input.activeId
}
