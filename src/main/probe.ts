export async function probeHarnessWeb(
  url: string,
  timeoutMs = 1500,
): Promise<boolean> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, { signal: controller.signal })
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
