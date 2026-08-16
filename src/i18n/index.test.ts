import { deepEqual, equal } from 'node:assert/strict'
import { test } from 'node:test'
import {
  changeLanguage,
  formatHostError,
  isConnectFailure,
  ready,
  resolveLocale,
  t,
  toHostError,
} from './index.js'

await ready()

test('resolveLocale follows an explicit preference and maps Chinese system locales', () => {
  equal(resolveLocale('en', 'zh-CN'), 'en')
  equal(resolveLocale('system', 'zh-CN'), 'zh-CN')
  equal(resolveLocale('system', 'zh_TW'), 'zh-CN')
  equal(resolveLocale(undefined, 'en-US'), 'en')
})

test('t interpolates after switching languages', async () => {
  await changeLanguage('zh-CN')
  equal(t('common.settings'), '设置')
  await changeLanguage('en')
  equal(t('common.settings'), 'Settings')
  equal(t('tray.connectedLocal', { port: 3080 }), 'Connected · local 3080')
  await changeLanguage('zh-CN')
})

test('formatHostError translates codes and keeps unknown messages', async () => {
  await changeLanguage('zh-CN')
  equal(formatHostError({ code: 'error.invalidPort' }), '端口必须是 1–65535 的整数')
  equal(formatHostError({ code: 'error.unknown', params: { message: 'boom' } }), 'boom')
  equal(isConnectFailure({ code: 'error.notRunning' }), true)
  equal(isConnectFailure({ code: 'error.invalidPort' }), false)
  deepEqual(toHostError(new Error('error.interactivePrompt')), { code: 'error.interactivePrompt' })
})
