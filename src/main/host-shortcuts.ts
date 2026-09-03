export type HostShortcut =
  | 'reload-view'
  | 'open-settings'
  | 'toggle-devtools'
  | 'toggle-sidebar'
  | 'quit'

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
    return 'reload-view'
  }
  if (key === ',') {
    return 'open-settings'
  }
  if (key === '\\') {
    return 'toggle-sidebar'
  }
  if (key === 'q') {
    return 'quit'
  }
  return null
}
