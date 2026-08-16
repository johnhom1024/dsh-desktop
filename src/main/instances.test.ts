import { deepEqual, equal } from 'node:assert/strict'
import { test } from 'node:test'
import { defaultLocalInstance, type Settings } from './runtime.js'
import { instanceLabel, removeInstance, renameInstance, selectInstance, setLocalPort, upsertInstance } from './instances.js'

function base(): Settings {
  const local = defaultLocalInstance()
  return { instances: [local], activeInstanceId: local.id, openAtLogin: false, autoStart: false }
}

test('selectInstance rejects an unknown id', () => {
  equal(selectInstance(base(), 'missing'), null)
})

test('selectInstance switches the active id', () => {
  const local = defaultLocalInstance()
  const remote = {
    id: 'remote-192.168.31.229-3080',
    name: 'NAS',
    kind: 'remote' as const,
    url: 'http://192.168.31.229:3080',
  }
  const next = selectInstance({ ...base(), instances: [local, remote] }, remote.id)
  equal(next?.activeInstanceId, remote.id)
})

test('upsertInstance adds a remote http url', () => {
  const next = upsertInstance(base(), {
    name: 'NAS',
    kind: 'remote',
    url: 'http://192.168.31.229:3080',
  })
  equal(next?.instances.length, 2)
  equal(next?.instances[1]?.kind, 'remote')
  equal(next?.instances[1]?.url, 'http://192.168.31.229:3080')
  equal(next?.instances[1]?.id, 'remote-192.168.31.229-3080')
  equal(next?.activeInstanceId, 'remote-192.168.31.229-3080')
})

test('upsertInstance rejects file: urls', () => {
  equal(upsertInstance(base(), { name: 'bad', kind: 'remote', url: 'file:///tmp' }), null)
})

test('removeInstance refuses to delete the last local instance', () => {
  equal(removeInstance(base(), 'local-3080'), null)
})

test('removeInstance moves activeId when the active tab is removed', () => {
  const local = defaultLocalInstance()
  const remote = {
    id: 'remote-192.168.31.229-3080',
    name: 'NAS',
    kind: 'remote' as const,
    url: 'http://192.168.31.229:3080',
  }
  const next = removeInstance(
    { instances: [local, remote], activeInstanceId: remote.id, openAtLogin: false, autoStart: false },
    remote.id,
  )
  deepEqual(next?.instances, [local])
  equal(next?.activeInstanceId, local.id)
})

test('renameInstance updates only the tab name', () => {
  const next = renameInstance(base(), 'local-3080', '  工作区  ')
  equal(next?.instances[0]?.name, '工作区')
  equal(next?.instances[0]?.url, 'http://127.0.0.1:3080')
  equal(next?.activeInstanceId, 'local-3080')
})

test('renameInstance rejects a blank name', () => {
  equal(renameInstance(base(), 'local-3080', '   '), null)
})

test('renameInstance rejects a name longer than 20 characters', () => {
  equal(renameInstance(base(), 'local-3080', '一二三四五六七八九十一二三四五六七八九十超'), null)
})

test('upsertInstance can rename a local instance without changing its url', () => {
  const next = upsertInstance(base(), {
    id: 'local-3080',
    name: '工作区',
    kind: 'local',
    url: 'http://127.0.0.1:3080',
  })
  equal(next?.instances[0]?.name, '工作区')
  equal(next?.instances[0]?.url, 'http://127.0.0.1:3080')
  equal(next?.instances.length, 1)
})

test('setLocalPort rewrites the local instance url and id', () => {
  const next = setLocalPort(base(), 18080)
  equal(next?.instances[0]?.id, 'local-18080')
  equal(next?.instances[0]?.url, 'http://127.0.0.1:18080')
  equal(next?.instances[0]?.name, 'deepseek-harness')
  equal(next?.activeInstanceId, 'local-18080')
})

test('setLocalPort keeps a custom local tab name', () => {
  const next = setLocalPort({ ...base(), instances: [{ ...base().instances[0]!, name: '工作区' }] }, 18080)
  equal(next?.instances[0]?.name, '工作区')
})

test('setLocalPort rejects a port outside 1-65535', () => {
  equal(setLocalPort(base(), 70000), null)
})

test('instanceLabel uses host:port for remotes and deepseek-harness for local', () => {
  equal(instanceLabel(defaultLocalInstance()), 'deepseek-harness')
  equal(
    instanceLabel({
      kind: 'remote',
      url: 'http://192.168.31.229:3080',
    }),
    '192.168.31.229:3080',
  )
})
