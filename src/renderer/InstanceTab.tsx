import { Globe, MoreHorizontal } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { DeepSeekIcon } from '@/components/icons/DeepSeekIcon'
import { cn } from '@/lib/utils'
import type { Instance } from './dsh-shell'

type InstanceTabProps = {
  instance: Instance
  selected: boolean
  href?: string | null
  collapsed?: boolean
  onSelect: (instance: Instance) => void
  onMenu: (instance: Instance) => void
}

export function tabUrlLabel(url: string | null | undefined): string | undefined {
  if (!url) {
    return undefined
  }
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return url
    }
    const port = parsed.port || (parsed.protocol === 'https:' ? '443' : '80')
    return `${parsed.protocol}//${parsed.hostname}:${port}`
  } catch {
    return url
  }
}

export function InstanceTab({ instance, selected, href, collapsed = false, onSelect, onMenu }: InstanceTabProps) {
  const { t } = useTranslation()
  const urlLabel = tabUrlLabel(href ?? instance.url)
  const isRemote = instance.kind === 'remote'
  const iconClass = cn('size-5 shrink-0', selected && 'text-primary')
  return (
    <div
      title={collapsed ? [instance.name, urlLabel].filter(Boolean).join('\n') : urlLabel}
      className={cn(
        'group relative flex shrink-0 items-center rounded-xl border text-sm transition-colors',
        collapsed ? 'size-11 self-center' : 'h-11 w-full pr-1',
        selected
          ? 'border-primary/15 bg-primary/10 text-foreground shadow-sm'
          : 'border-transparent text-muted-foreground hover:bg-foreground/5 hover:text-foreground',
      )}
    >
      <button
        type="button"
        role="tab"
        data-tab={instance.id}
        aria-label={instance.name}
        aria-selected={selected}
        aria-haspopup="menu"
        className={cn(
          'inline-flex h-full min-w-0 flex-1 items-center rounded-xl',
          collapsed ? 'justify-center' : 'gap-2.5 pl-3 pr-1',
        )}
        onContextMenu={(event) => {
          event.preventDefault()
          onMenu(instance)
        }}
        onKeyDown={(event) => {
          if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
            event.preventDefault()
            onMenu(instance)
          }
        }}
        onClick={() => {
          onSelect(instance)
        }}
      >
        {isRemote ? <Globe className={iconClass} aria-hidden="true" /> : <DeepSeekIcon className={iconClass} />}
        {!collapsed ? <span className="truncate font-medium">{instance.name}</span> : null}
      </button>
      {!collapsed ? <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-6 shrink-0 text-muted-foreground opacity-0 transition-opacity hover:bg-foreground/10 hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100"
        aria-label={t('chrome.instanceMenu', { name: instance.name })}
        onClick={(event) => {
          event.stopPropagation()
          onMenu(instance)
        }}
      >
        <MoreHorizontal className="size-3.5" aria-hidden="true" />
      </Button> : null}
    </div>
  )
}
