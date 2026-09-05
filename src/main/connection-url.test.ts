import { test } from 'node:test'
import { equal, deepEqual } from 'node:assert/strict'
import { parseConnectionUrl, connectionUrlLabel } from '../connection-url.js'

test('connection URL preserves scheme path encoded token query and fragment', () => {
  for (const origin of ['http://127.0.0.1:3080', 'https://example.com', 'http://[::1]:3080']) {
    const url = `${origin}/dsh/?token=a%2Bb%2Fc%3D&next=%2Fapp#session`
    equal(parseConnectionUrl(url)?.url, url)
    equal(connectionUrlLabel(url), `${origin}/dsh/`)
  }
})

test('connection URL supports host:port and normal URL default ports', () => {
  deepEqual(parseConnectionUrl(' localhost:3080 '), { url: 'http://localhost:3080/', host: 'localhost', port: 3080 })
  equal(parseConnectionUrl('https://example.com')?.port, 443)
  equal(parseConnectionUrl('http://example.com')?.port, 80)
})

test('connection URL rejects credentials non-http schemes and malformed input', () => {
  for (const value of ['', 'localhost', 'http://', 'ftp://example.com', 'javascript:alert(1)', 'http://u:p@example.com', 'http://u@example.com', 'http://http://localhost:3080', 'http://localhost:0', 'http://localhost:99999', 'http://local host:3080', 'http:\\localhost:3080', null]) {
    equal(parseConnectionUrl(value), null, String(value))
  }
})
