export type ThemeMode = 'light' | 'dark' | 'system'

export const THEME_STORAGE_KEY = 'dsh-theme'

const THEME_ORDER: ThemeMode[] = ['light', 'dark', 'system']

export function isThemeMode(value: string | null | undefined): value is ThemeMode {
  return value === 'light' || value === 'dark' || value === 'system'
}

export function nextTheme(current: ThemeMode): ThemeMode {
  return THEME_ORDER[(THEME_ORDER.indexOf(current) + 1) % THEME_ORDER.length]!
}

export function themeLabelKey(mode: ThemeMode): 'theme.light' | 'theme.dark' | 'theme.system' {
  switch (mode) {
    case 'light':
      return 'theme.light'
    case 'dark':
      return 'theme.dark'
    case 'system':
      return 'theme.system'
  }
}

export function resolveDark(mode: ThemeMode, prefersDark: boolean): boolean {
  return mode === 'dark' || (mode === 'system' && prefersDark)
}

export function readStoredTheme(storage: Pick<Storage, 'getItem'> | null | undefined): ThemeMode {
  if (!storage) {
    return 'system'
  }
  try {
    const value = storage.getItem(THEME_STORAGE_KEY)
    return isThemeMode(value) ? value : 'system'
  } catch {
    return 'system'
  }
}

export function applyTheme(
  mode: ThemeMode,
  root: { classList: { toggle: (name: string, force?: boolean) => unknown }; dataset: { theme?: string } },
  prefersDark: boolean,
): void {
  root.classList.toggle('dark', resolveDark(mode, prefersDark))
  root.dataset.theme = mode
}

export function nativeThemeSource(mode: ThemeMode): 'system' | 'light' | 'dark' {
  return mode
}
