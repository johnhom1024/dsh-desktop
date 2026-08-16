import { useEffect } from 'react'
import { cn } from '@/lib/utils'

export type ToastItem = {
  id: number
  title?: string
  description: string
}

type ToasterProps = {
  toasts: ToastItem[]
  onDismiss: (id: number) => void
}

export function Toaster({ toasts, onDismiss }: ToasterProps) {
  return (
    <div className="pointer-events-none fixed inset-x-0 top-14 z-50 flex justify-center px-4">
      <div className="flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2">
        {toasts.map((item) => (
          <Toast key={item.id} item={item} onDismiss={onDismiss} />
        ))}
      </div>
    </div>
  )
}

function Toast({ item, onDismiss }: { item: ToastItem; onDismiss: (id: number) => void }) {
  useEffect(() => {
    const timer = window.setTimeout(() => {
      onDismiss(item.id)
    }, 5000)
    return () => {
      window.clearTimeout(timer)
    }
  }, [item.id, onDismiss])

  return (
    <div
      role="status"
      className={cn(
        'pointer-events-auto rounded-xl border bg-popover p-4 text-popover-foreground shadow-lg',
      )}
    >
      {item.title ? <p className="text-sm font-medium">{item.title}</p> : null}
      <p className={cn('text-sm text-muted-foreground', item.title ? 'mt-1' : null)}>{item.description}</p>
    </div>
  )
}
