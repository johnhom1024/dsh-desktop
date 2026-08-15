export type HostShortcut = 'reload-host' | 'reconnect' | 'open-settings' | 'toggle-devtools'

export type ShortcutInput = {
  type: string
  key: string
  meta: boolean
  control: boolean
  alt: boolean
  shift: boolean
}

export function hostShortcutFor(
  input: ShortcutInput,
  opts: { isMac: boolean; isDev: boolean },
): HostShortcut | null {
  if (input.type !== 'keyDown') {
    return null
  }
  const key = input.key.toLowerCase()
  if (key === 'f12') {
    return 'toggle-devtools'
  }
  const modifier = opts.isMac ? input.meta : input.control
  if (!modifier) {
    return null
  }
  if (key === 'i' || key === 'j') {
    if (opts.isMac ? input.alt : input.shift) {
      return 'toggle-devtools'
    }
    return null
  }
  if (key === 'r') {
    if (opts.isDev && input.shift) {
      return 'reconnect'
    }
    return opts.isDev ? 'reload-host' : 'reconnect'
  }
  if (key === ',') {
    return 'open-settings'
  }
  return null
}
