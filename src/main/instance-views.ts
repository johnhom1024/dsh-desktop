export const TAB_BAR_HEIGHT = 44

export type ViewBounds = {
  x: number
  y: number
  width: number
  height: number
}

export function chromeContentBounds(
  windowBounds: { width: number; height: number },
  tabBarHeight: number,
): ViewBounds {
  return {
    x: 0,
    y: tabBarHeight,
    width: Math.max(0, windowBounds.width),
    height: Math.max(0, windowBounds.height - tabBarHeight),
  }
}

export function layoutActiveView(
  views: Map<string, { setBounds: (bounds: ViewBounds) => void }>,
  activeId: string | null,
  windowBounds: { width: number; height: number },
  tabBarHeight: number,
): void {
  if (!activeId) {
    return
  }
  const view = views.get(activeId)
  if (!view) {
    return
  }
  view.setBounds(chromeContentBounds(windowBounds, tabBarHeight))
}

export function shouldShowInstanceView(input: {
  hasUrl: boolean
  instanceId: string
  activeId: string | null
  overlayOpen: boolean
}): boolean {
  return input.hasUrl && !input.overlayOpen && input.instanceId === input.activeId
}
