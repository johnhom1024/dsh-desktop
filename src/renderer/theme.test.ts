import { describe, expect, test } from 'vitest'
import { applyTheme, nativeThemeSource, nextTheme, readStoredTheme, resolveDark, themeLabel } from './theme'

describe('theme', () => {
  test('cycles light, dark, then system', () => {
    expect(nextTheme('light')).toBe('dark')
    expect(nextTheme('dark')).toBe('system')
    expect(nextTheme('system')).toBe('light')
  })

  test('system follows the OS preference', () => {
    expect(resolveDark('light', true)).toBe(false)
    expect(resolveDark('dark', false)).toBe(true)
    expect(resolveDark('system', true)).toBe(true)
    expect(resolveDark('system', false)).toBe(false)
  })

  test('reads a stored theme and falls back to system', () => {
    expect(readStoredTheme({ getItem: () => 'dark' })).toBe('dark')
    expect(readStoredTheme({ getItem: () => 'nope' })).toBe('system')
    expect(readStoredTheme(null)).toBe('system')
  })

  test('applyTheme writes the class and data attribute', () => {
    const classes = new Set<string>()
    const root = {
      classList: {
        toggle(name: string, force?: boolean) {
          if (force) {
            classes.add(name)
          } else {
            classes.delete(name)
          }
        },
      },
      dataset: {} as DOMStringMap,
    }
    applyTheme('dark', root, false)
    expect(classes.has('dark')).toBe(true)
    expect(root.dataset.theme).toBe('dark')
    applyTheme('light', root, true)
    expect(classes.has('dark')).toBe(false)
    expect(themeLabel('system')).toBe('跟随系统')
    expect(nativeThemeSource('light')).toBe('light')
    expect(nativeThemeSource('system')).toBe('system')
  })
})
