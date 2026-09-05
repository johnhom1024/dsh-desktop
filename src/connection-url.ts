export type ConnectionTarget = { url: string; host: string; port: number }

/** Accept full HTTP(S) URLs or host:port; never discard authentication query parameters. */
export function parseConnectionUrl(value: unknown): ConnectionTarget | null {
  if (typeof value !== 'string') return null
  const raw = value.trim()
  if (!raw || /[\s\\]/.test(raw)) return null
  const hasScheme = /^[a-z][a-z\d+.-]*:\/\//i.test(raw)
  if (!hasScheme && !/^(?:\[[\da-f:]+\]|[^/:?#]+):\d+(?:[/?#]|$)/i.test(raw)) return null
  try {
    const parsed = new URL(hasScheme ? raw : `http://${raw}`)
    if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname || parsed.username || parsed.password) return null
    if (['http', 'https'].includes(parsed.hostname)) return null
    const port = Number(parsed.port || (parsed.protocol === 'https:' ? 443 : 80))
    if (!Number.isInteger(port) || port < 1 || port > 65535) return null
    return { url: parsed.href, host: parsed.hostname, port }
  } catch {
    return null
  }
}

/** Query strings can contain launch credentials; omit them in status/error/log displays. */
export function connectionUrlLabel(value: string): string {
  try {
    const url = new URL(value)
    return `${url.origin}${url.pathname === '/' ? '' : url.pathname}`
  } catch {
    return '[invalid URL]'
  }
}
