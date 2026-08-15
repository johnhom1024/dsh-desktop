export const RENDERER_DEV_URL = 'http://127.0.0.1:5173/'

function originOf(value: string): string | null {
  try {
    return new URL(value).origin
  } catch {
    return null
  }
}

export function isHostPage(url: string, devUrl: string | undefined = process.env.VITE_DEV_SERVER_URL): boolean {
  if (!url) {
    return false
  }
  if (devUrl) {
    const actual = originOf(url)
    const expected = originOf(devUrl)
    if (actual && expected && actual === expected) {
      return true
    }
  }
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'file:' && parsed.pathname.endsWith('/index.html')
  } catch {
    return false
  }
}
