import { contextBridge, ipcRenderer } from 'electron'
import type { Settings } from '../main/runtime.js'
import type { PackageManagerOption } from '../main/package-managers.js'
import type { UpdateReport } from '../main/updates.js'

export type ShellState = {
  detected: boolean
  url: string | null
  sourceKind: string
  localPort: number
  managers: PackageManagerOption[]
  lastError: string | null
  lastPackageManager: string | null
}

contextBridge.exposeInMainWorld('dshShell', {
  getState: (): Promise<ShellState> => ipcRenderer.invoke('shellGetState'),
  detect: (): Promise<ShellState> => ipcRenderer.invoke('shellDetect'),
  install: (id: PackageManagerOption['id']): Promise<ShellState> =>
    ipcRenderer.invoke('shellInstall', id),
  openSettings: (): Promise<void> => ipcRenderer.invoke('shellOpenSettings'),
  onInstallLog: (listener: (text: string) => void) => {
    const wrapped = (_event: unknown, text: string) => listener(text)
    ipcRenderer.on('shellInstallLog', wrapped)
    return () => {
      ipcRenderer.removeListener('shellInstallLog', wrapped)
    }
  },
})

contextBridge.exposeInMainWorld('dshSettings', {
  get: () => ipcRenderer.invoke('settingsGet'),
  save: (settings: Settings) => ipcRenderer.invoke('settingsSave', settings),
  reconnect: () => ipcRenderer.invoke('settingsReconnect'),
  checkUpdates: (): Promise<UpdateReport> => ipcRenderer.invoke('settingsCheckUpdates'),
  openExternal: (url: string) => ipcRenderer.invoke('settingsOpenExternal', url),
  onUpdatesResult: (listener: (report: UpdateReport) => void) => {
    const wrapped = (_event: unknown, report: UpdateReport) => listener(report)
    ipcRenderer.on('updatesResult', wrapped)
    return () => {
      ipcRenderer.removeListener('updatesResult', wrapped)
    }
  },
})
