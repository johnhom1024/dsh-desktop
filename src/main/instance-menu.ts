import { t } from '../i18n/index.js'

export type InstanceMenuAction = 'rename' | 'reload' | 'open-external'

export type InstanceMenuItem = {
  id: InstanceMenuAction
  label: string
  enabled: boolean
}

export function instanceMenuItems(canReload: boolean, canOpenExternal: boolean): InstanceMenuItem[] {
  return [
    {
      id: 'rename',
      label: t('instanceMenu.rename'),
      enabled: true,
    },
    {
      id: 'reload',
      label: t('instanceMenu.reload'),
      enabled: canReload,
    },
    {
      id: 'open-external',
      label: t('instanceMenu.openExternal'),
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
