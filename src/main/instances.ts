import {
  DEFAULT_LOCAL_INSTANCE_NAME,
  defaultLocalInstance,
  type Instance,
  type InstanceKind,
  type Settings,
} from './runtime.js'

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function isLocalUrl(value: string): boolean {
  try {
    const url = new URL(value)
    if (url.protocol !== 'http:') {
      return false
    }
    return url.hostname === '127.0.0.1' || url.hostname === 'localhost'
  } catch {
    return false
  }
}

export function instanceLabel(instance: Pick<Instance, 'kind' | 'url'> & { name?: string }): string {
  if (instance.kind === 'local') {
    return instance.name?.trim() || DEFAULT_LOCAL_INSTANCE_NAME
  }
  try {
    const parsed = new URL(instance.url)
    return parsed.port ? `${parsed.hostname}:${parsed.port}` : parsed.host
  } catch {
    return instance.name || instance.url
  }
}

function remoteId(url: string): string {
  const parsed = new URL(url)
  const port = parsed.port || (parsed.protocol === 'https:' ? '443' : '80')
  return `remote-${parsed.hostname}-${port}`
}

function localId(url: string): string {
  const port = new URL(url).port || '80'
  return `local-${port}`
}

export function selectInstance(settings: Settings, id: string): Settings | null {
  if (!settings.instances.some((item) => item.id === id)) {
    return null
  }
  return { ...settings, activeInstanceId: id }
}

export function renameInstance(settings: Settings, id: string, name: string): Settings | null {
  const trimmed = name.trim()
  if (!trimmed) {
    return null
  }
  const index = settings.instances.findIndex((item) => item.id === id)
  if (index === -1) {
    return null
  }
  const current = settings.instances[index]!
  if (current.name === trimmed) {
    return settings
  }
  const instances = settings.instances.map((item, i) => (i === index ? { ...item, name: trimmed } : item))
  return { ...settings, instances }
}

export function upsertInstance(
  settings: Settings,
  input: { id?: string; name: string; kind: InstanceKind; url: string },
): Settings | null {
  if (!isHttpUrl(input.url)) {
    return null
  }
  if (input.kind === 'local' && !isLocalUrl(input.url)) {
    return null
  }

  const id = input.id ?? (input.kind === 'local' ? localId(input.url) : remoteId(input.url))
  const name = input.name.trim() || instanceLabel({ kind: input.kind, url: input.url, name: input.name })
  const nextItem: Instance = { id, name, kind: input.kind, url: input.url }
  const index = settings.instances.findIndex((item) => item.id === id)
  const instances =
    index === -1
      ? [...settings.instances, nextItem]
      : settings.instances.map((item, i) => (i === index ? nextItem : item))

  return {
    ...settings,
    instances,
    activeInstanceId: id,
  }
}

export function removeInstance(settings: Settings, id: string): Settings | null {
  const target = settings.instances.find((item) => item.id === id)
  if (!target) {
    return null
  }
  if (target.kind === 'local' && settings.instances.filter((item) => item.kind === 'local').length === 1) {
    return null
  }
  const instances = settings.instances.filter((item) => item.id !== id)
  if (instances.length === 0) {
    const local = defaultLocalInstance()
    return { ...settings, instances: [local], activeInstanceId: local.id }
  }
  const activeInstanceId =
    settings.activeInstanceId === id ? instances[0]!.id : settings.activeInstanceId
  return { ...settings, instances, activeInstanceId }
}
