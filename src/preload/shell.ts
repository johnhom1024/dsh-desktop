import { contextBridge, ipcRenderer } from 'electron'
import type { Settings } from '../main/runtime.js'
import type { PackageManagerOption } from '../main/package-managers.js'

export type ShellState = {
  detected: boolean
  url: string | null
  sourceKind: string
  managers: PackageManagerOption[]
  lastError: string | null
}

contextBridge.exposeInMainWorld('dshShell', {
  getState: (): Promise<ShellState> => ipcRenderer.invoke('shellGetState'),
  detect: (): Promise<ShellState> => ipcRenderer.invoke('shellDetect'),
  install: (id: PackageManagerOption['id']): Promise<ShellState> =>
    ipcRenderer.invoke('shellInstall', id),
  openSettings: (): Promise<void> => ipcRenderer.invoke('shellOpenSettings'),
})

contextBridge.exposeInMainWorld('dshSettings', {
  get: () => ipcRenderer.invoke('settingsGet'),
  save: (settings: Settings) => ipcRenderer.invoke('settingsSave', settings),
  reconnect: () => ipcRenderer.invoke('settingsReconnect'),
})
