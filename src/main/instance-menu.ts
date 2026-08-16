import { t } from '../i18n/index.js'

export type InstanceMenuAction = 'rename' | 'reload' | 'open-external'

export type InstanceMenuItem = {
  id: InstanceMenuAction
  label: string
  symbol: string
  enabled: boolean
}

export function instanceMenuItems(canReload: boolean, canOpenExternal: boolean): InstanceMenuItem[] {
  return [
    {
      id: 'rename',
      label: t('instanceMenu.rename'),
      symbol: 'pencil',
      enabled: true,
    },
    {
      id: 'reload',
      label: t('instanceMenu.reload'),
      symbol: 'arrow.clockwise',
      enabled: canReload,
    },
    {
      id: 'open-external',
      label: t('instanceMenu.openExternal'),
      symbol: 'safari',
      enabled: canOpenExternal,
    },
  ]
}

export function instanceExternalUrl(input: { url?: string | null; fallbackUrl?: string | null }): string | null {
  const candidates = [input.url, input.fallbackUrl]
  for (const candidate of candidates) {
    if (!candidate) {
      continue
    }
    try {
      const parsed = new URL(candidate)
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        return parsed.toString()
      }
    } catch {
      // try the next candidate
    }
  }
  return null
}
