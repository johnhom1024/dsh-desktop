import { contextBridge, ipcRenderer } from 'electron'
import type { Instance } from '../main/runtime.js'
import type { PackageManagerOption } from '../main/package-managers.js'
import type { UpdateReport } from '../main/updates.js'

export type ShellState = {
  detected: boolean
  url: string | null
  sourceKind: string
  localPort: number
  instances: Instance[]
  activeInstanceId: string | null
  managers: PackageManagerOption[]
  lastError: string | null
  lastPackageManager: string | null
  settingsOpen: boolean
  openAtLogin: boolean
  appVersion: string
  dshVersion: string | null
}

contextBridge.exposeInMainWorld('dshShell', {
  getState: (): Promise<ShellState> => ipcRenderer.invoke('shellGetState'),
  detect: (): Promise<ShellState> => ipcRenderer.invoke('shellDetect'),
  install: (id: PackageManagerOption['id']): Promise<ShellState> =>
    ipcRenderer.invoke('shellInstall', id),
  selectInstance: (id: string): Promise<ShellState> => ipcRenderer.invoke('shellSelectInstance', id),
  addInstance: (input: { name: string; kind: 'local' | 'remote'; url: string }): Promise<ShellState> =>
    ipcRenderer.invoke('shellAddInstance', input),
  updateInstance: (input: { id: string; name: string; url: string }): Promise<ShellState> =>
    ipcRenderer.invoke('shellUpdateInstance', input),
  removeInstance: (id: string): Promise<ShellState> => ipcRenderer.invoke('shellRemoveInstance', id),
  openSettings: (): Promise<void> => ipcRenderer.invoke('shellOpenSettings'),
  closeSettings: (): Promise<void> => ipcRenderer.invoke('shellCloseSettings'),
  acquireOverlay: (): Promise<void> => ipcRenderer.invoke('shellAcquireOverlay'),
  releaseOverlay: (): Promise<void> => ipcRenderer.invoke('shellReleaseOverlay'),
  popupInstanceMenu: (input: { instanceId: string }): Promise<'rename' | null> =>
    ipcRenderer.invoke('shellPopupInstanceMenu', input),
  saveHost: (input: { openAtLogin: boolean }): Promise<boolean> =>
    ipcRenderer.invoke('shellSaveHost', input),
  checkUpdates: (): Promise<UpdateReport> => ipcRenderer.invoke('settingsCheckUpdates'),
  openUserData: (): Promise<void> => ipcRenderer.invoke('shellOpenUserData'),
  setTheme: (mode: 'light' | 'dark' | 'system'): Promise<void> =>
    ipcRenderer.invoke('shellSetTheme', mode),
  onInstallLog: (listener: (text: string) => void) => {
    const wrapped = (_event: unknown, text: string) => listener(text)
    ipcRenderer.on('shellInstallLog', wrapped)
    return () => {
      ipcRenderer.removeListener('shellInstallLog', wrapped)
    }
  },
  onState: (listener: (state: ShellState) => void) => {
    const wrapped = (_event: unknown, state: ShellState) => listener(state)
    ipcRenderer.on('shellState', wrapped)
    return () => {
      ipcRenderer.removeListener('shellState', wrapped)
    }
  },
  onOpenSettings: (listener: () => void) => {
    const wrapped = () => listener()
    ipcRenderer.on('shellOpenSettings', wrapped)
    return () => {
      ipcRenderer.removeListener('shellOpenSettings', wrapped)
    }
  },
  onUpdatesResult: (listener: (report: UpdateReport) => void) => {
    const wrapped = (_event: unknown, report: UpdateReport) => listener(report)
    ipcRenderer.on('updatesResult', wrapped)
    return () => {
      ipcRenderer.removeListener('updatesResult', wrapped)
    }
  },
})
