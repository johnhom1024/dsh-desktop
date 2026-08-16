import { describe, expect, test } from 'vitest'
import { tabUrlLabel } from './InstanceTab'

describe('tabUrlLabel', () => {
  test('formats http host and port', () => {
    expect(tabUrlLabel('http://127.0.0.1:3080/session')).toBe('http://127.0.0.1:3080')
    expect(tabUrlLabel('http://192.168.31.229:18080')).toBe('http://192.168.31.229:18080')
  })

  test('fills in a default port when the url omits it', () => {
    expect(tabUrlLabel('http://127.0.0.1/')).toBe('http://127.0.0.1:80')
    expect(tabUrlLabel('https://example.com/app')).toBe('https://example.com:443')
  })

  test('returns undefined when there is no url', () => {
    expect(tabUrlLabel(null)).toBeUndefined()
    expect(tabUrlLabel(undefined)).toBeUndefined()
  })
})
