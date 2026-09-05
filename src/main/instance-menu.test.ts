import { deepEqual, equal } from 'node:assert/strict'
import { test } from 'node:test'
import { changeLanguage, ready } from '../i18n/index.js'
import { instanceExternalUrl, instanceMenuItems } from './instance-menu.js'

await ready()
await changeLanguage('zh-CN')

test('instanceMenuItems returns text-only rename, reload, then browser open', () => {
  deepEqual(instanceMenuItems(true, true), [
    { id: 'rename', label: '重命名', enabled: true },
    { id: 'reload', label: '刷新', enabled: true },
    { id: 'open-external', label: '浏览器打开', enabled: true },
  ])
})

test('instanceMenuItems disables reload and browser open when there is no url', () => {
  equal(instanceMenuItems(false, false)[0]?.enabled, true)
  equal(instanceMenuItems(false, false)[1]?.enabled, false)
  equal(instanceMenuItems(false, false)[2]?.enabled, false)
})

test('instanceExternalUrl prefers the live url then the saved instance url', () => {
  equal(
    instanceExternalUrl({ url: 'http://127.0.0.1:3080/', fallbackUrl: 'http://127.0.0.1:18080/' }),
    'http://127.0.0.1:3080/',
  )
  equal(instanceExternalUrl({ url: null, fallbackUrl: 'http://127.0.0.1:18080' }), 'http://127.0.0.1:18080/')
  equal(instanceExternalUrl({ url: 'file:///tmp', fallbackUrl: null }), null)
})
