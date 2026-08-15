import { contextBridge, ipcRenderer } from 'electron'
import type { Settings } from '../main/runtime.js'
import type { UpdateReport } from '../main/updates.js'

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
