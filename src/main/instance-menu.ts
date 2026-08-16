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
      label: '重命名',
      symbol: 'pencil',
      enabled: true,
    },
    {
      id: 'reload',
      label: '刷新',
      symbol: 'arrow.clockwise',
      enabled: canReload,
    },
    {
      id: 'open-external',
      label: '浏览器打开',
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
