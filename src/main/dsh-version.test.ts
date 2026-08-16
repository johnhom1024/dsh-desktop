import { equal } from 'node:assert/strict'
import { test } from 'node:test'
import { parseDshVersionFromText, parseDshVersionOutput, readCliDshVersion } from './dsh-version.js'

test('parseDshVersionOutput reads a bare CLI version', () => {
  equal(parseDshVersionOutput('0.1.0-rc.6\n'), '0.1.0-rc.6')
})

test('parseDshVersionOutput strips a v prefix', () => {
  equal(parseDshVersionOutput('v0.1.0\n'), '0.1.0')
})

test('parseDshVersionOutput ignores empty output', () => {
  equal(parseDshVersionOutput('   \n'), null)
})

test('parseDshVersionFromText reads a version from html or json', () => {
  equal(parseDshVersionFromText('<title>DeepSeek Harness 0.1.0-rc.6</title>'), '0.1.0-rc.6')
  equal(parseDshVersionFromText('{"name":"@deepseek-ai/dsh","version":"0.1.0-rc.6"}'), '0.1.0-rc.6')
  equal(parseDshVersionFromText('no version here'), null)
})

test('readCliDshVersion runs dsh -V', async () => {
  const version = await readCliDshVersion(async (command, args) => {
    equal(command, 'dsh')
    equal(args.join(' '), '-V')
    return '0.1.0-rc.6\n'
  })
  equal(version, '0.1.0-rc.6')
})
