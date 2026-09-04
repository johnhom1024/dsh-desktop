export async function probeHarnessWeb(
  url: string,
  timeoutMs = 1500,
): Promise<boolean> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, { signal: controller.signal, redirect: 'manual' })
    // dsh 0.1.2+ gates the page behind a launch token / browser-auth cookie.
    // Those auth responses only count as ready when the URL carries the launch
    // token — i.e. the host spawned this server and can complete the handshake
    // in the WebContentsView. A bare 401 (external server, no token) must not
    // be treated as a reusable official page.
    const hasToken = new URL(url).searchParams.has('token')
    if (hasToken && (response.status === 401 || response.status === 303)) {
      return true
    }
    if (!response.ok) {
      return false
    }

    const contentType = response.headers.get('content-type') ?? ''
    const body = await response.text()
    const looksLikeHtml =
      contentType.includes('html') || /<html|<!doctype html|<title/i.test(body)

    return looksLikeHtml && body.includes('DeepSeek Harness')
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}
