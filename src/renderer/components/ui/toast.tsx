import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export type ToastAction = {
  id: string
  label: string
  onClick: () => void
}

export type ToastItem = {
  id: number
  title?: string
  description: string
  actions?: ToastAction[]
}

type ToasterProps = {
  toasts: ToastItem[]
  onDismiss: (id: number) => void
}

export function Toaster({ toasts, onDismiss }: ToasterProps) {
  return (
    <div className="pointer-events-none absolute inset-x-2 top-14 z-50 flex flex-col items-stretch gap-2">
      <div className="flex w-full flex-col gap-2">
        {toasts.map((item) => (
          <Toast key={item.id} item={item} onDismiss={onDismiss} />
        ))}
      </div>
    </div>
  )
}

function Toast({ item, onDismiss }: { item: ToastItem; onDismiss: (id: number) => void }) {
  useEffect(() => {
    // Toasts with actions stay on screen until the user dismisses them —
    // there's no value in auto-closing while the user is reading the buttons.
    if (item.actions && item.actions.length > 0) {
      return
    }
    const timer = window.setTimeout(() => {
      onDismiss(item.id)
    }, 5000)
    return () => {
      window.clearTimeout(timer)
    }
  }, [item.id, item.actions, onDismiss])

  return (
    <div
      role="status"
      className={cn(
        'pointer-events-auto rounded-xl border bg-popover p-4 text-popover-foreground shadow-lg',
      )}
    >
      {item.title ? <p className="text-sm font-medium">{item.title}</p> : null}
      <p className={cn('text-sm text-muted-foreground', item.title ? 'mt-1' : null)}>{item.description}</p>
      {item.actions && item.actions.length > 0 ? (
        <div className="mt-3 flex justify-end gap-2">
          {item.actions.map((action) => (
            <Button
              key={action.id}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                action.onClick()
                onDismiss(item.id)
              }}
            >
              {action.label}
            </Button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
