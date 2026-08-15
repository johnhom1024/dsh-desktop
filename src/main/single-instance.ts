export function bindSingleInstance(hooks: {
  requestLock: () => boolean
  onSecondInstance: (handler: () => void) => void
  quit: () => void
  focusExisting: () => void
}): boolean {
  if (!hooks.requestLock()) {
    hooks.quit()
    return false
  }

  hooks.onSecondInstance(() => {
    hooks.focusExisting()
  })
  return true
}
