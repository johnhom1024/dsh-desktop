import { deepEqual, equal } from 'node:assert/strict'
import { test } from 'node:test'
import { bindSingleInstance } from './single-instance.js'

test('bindSingleInstance quits when the lock is already taken', () => {
  const calls: string[] = []

  const primary = bindSingleInstance({
    requestLock: () => false,
    onSecondInstance: () => {
      calls.push('listen')
    },
    quit: () => {
      calls.push('quit')
    },
    focusExisting: () => {
      calls.push('focus')
    },
  })

  equal(primary, false)
  deepEqual(calls, ['quit'])
})

test('bindSingleInstance keeps the first process and focuses it on a second launch', () => {
  const calls: string[] = []
  let secondLaunch: (() => void) | undefined

  const primary = bindSingleInstance({
    requestLock: () => true,
    onSecondInstance: (handler) => {
      secondLaunch = handler
    },
    quit: () => {
      calls.push('quit')
    },
    focusExisting: () => {
      calls.push('focus')
    },
  })

  equal(primary, true)
  secondLaunch?.()
  deepEqual(calls, ['focus'])
})
