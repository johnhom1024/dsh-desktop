import { deepEqual, equal } from 'node:assert/strict'
import { test } from 'node:test'
import { instanceExternalUrl, instanceMenuItems } from './instance-menu.js'

test('instanceMenuItems puts rename, reload, then browser open', () => {
  deepEqual(
    instanceMenuItems(true, true).map((item) => item.id),
    ['rename', 'reload', 'open-external'],
  )
  equal(instanceMenuItems(true, true)[0]?.label, '重命名')
  equal(instanceMenuItems(true, true)[0]?.symbol, 'pencil')
  equal(instanceMenuItems(true, true)[1]?.label, '刷新')
  equal(instanceMenuItems(true, true)[1]?.symbol, 'arrow.clockwise')
  equal(instanceMenuItems(true, true)[2]?.label, '浏览器打开')
  equal(instanceMenuItems(true, true)[2]?.symbol, 'safari')
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
