import { deepEqual, equal } from 'node:assert/strict'
import { test } from 'node:test'
import { defaultLocalInstance, type Settings } from './runtime.js'
import { instanceLabel, removeInstance, selectInstance, upsertInstance } from './instances.js'

function base(): Settings {
  const local = defaultLocalInstance()
  return { instances: [local], activeInstanceId: local.id, openAtLogin: false }
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
    { instances: [local, remote], activeInstanceId: remote.id, openAtLogin: false },
    remote.id,
  )
  deepEqual(next?.instances, [local])
  equal(next?.activeInstanceId, local.id)
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

test('instanceLabel uses host:port for remotes and 本机 for local', () => {
  equal(instanceLabel(defaultLocalInstance()), '本机 3080')
  equal(
    instanceLabel({
      kind: 'remote',
      url: 'http://192.168.31.229:3080',
    }),
    '192.168.31.229:3080',
  )
})
