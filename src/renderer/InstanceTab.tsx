import { MoreHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { Instance } from './dsh-shell'

type InstanceTabProps = {
  instance: Instance
  selected: boolean
  href?: string | null
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

export function InstanceTab({ instance, selected, href, onSelect, onMenu }: InstanceTabProps) {
  const urlLabel = tabUrlLabel(href ?? instance.url)
  return (
    <div
      title={urlLabel}
      className={cn(
        'group inline-flex h-8 max-w-60 min-w-0 items-center rounded-lg border pl-2.5 pr-0.5 text-sm transition-colors',
        selected
          ? 'border-border bg-card text-foreground shadow-sm'
          : 'border-transparent text-muted-foreground hover:bg-foreground/10 hover:text-foreground',
      )}
    >
      <button
        type="button"
        role="tab"
        data-tab={instance.id}
        aria-selected={selected}
        className="inline-flex min-w-0 flex-1 items-center gap-2 py-1 pr-1"
        onClick={() => {
          onSelect(instance)
        }}
      >
        <span className="size-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />
        <span className="truncate">{instance.name}</span>
      </button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-6 shrink-0 text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
        aria-label={`${instance.name} 菜单`}
        onClick={(event) => {
          event.stopPropagation()
          onMenu(instance)
        }}
      >
        <MoreHorizontal className="size-3.5" aria-hidden="true" />
      </Button>
    </div>
  )
}
