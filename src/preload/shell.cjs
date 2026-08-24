const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('dshShell', {
  getState: () => ipcRenderer.invoke('shellGetState'),
  detect: (input) => ipcRenderer.invoke('shellDetect', input),
  install: (id, input) => ipcRenderer.invoke('shellInstall', id, input),
  saveLocalPort: (input) => ipcRenderer.invoke('shellSaveLocalPort', input),
  stop: () => ipcRenderer.invoke('shellStop'),
  disconnect: () => ipcRenderer.invoke('shellDisconnect'),
  selectInstance: (id) => ipcRenderer.invoke('shellSelectInstance', id),
  addInstance: (input) => ipcRenderer.invoke('shellAddInstance', input),
  updateInstance: (input) => ipcRenderer.invoke('shellUpdateInstance', input),
  removeInstance: (id) => ipcRenderer.invoke('shellRemoveInstance', id),
  openSettings: () => ipcRenderer.invoke('shellOpenSettings'),
  closeSettings: () => ipcRenderer.invoke('shellCloseSettings'),
  acquireOverlay: () => ipcRenderer.invoke('shellAcquireOverlay'),
  releaseOverlay: () => ipcRenderer.invoke('shellReleaseOverlay'),
  popupInstanceMenu: (input) => ipcRenderer.invoke('shellPopupInstanceMenu', input),
  saveHost: (input) => ipcRenderer.invoke('shellSaveHost', input),
  checkUpdates: (target) => ipcRenderer.invoke('settingsCheckUpdates', target),
  updateDsh: () => ipcRenderer.invoke('shellUpdateDsh'),
  getInstallLog: () => ipcRenderer.invoke('shellGetInstallLog'),
  openUserData: () => ipcRenderer.invoke('shellOpenUserData'),
  setTheme: (mode) => ipcRenderer.invoke('shellSetTheme', mode),
  onInstallLog: (listener) => {
    const wrapped = (_event, text) => listener(text)
    ipcRenderer.on('shellInstallLog', wrapped)
    return () => {
      ipcRenderer.removeListener('shellInstallLog', wrapped)
    }
  },
  onState: (listener) => {
    const wrapped = (_event, state) => listener(state)
    ipcRenderer.on('shellState', wrapped)
    return () => {
      ipcRenderer.removeListener('shellState', wrapped)
    }
  },
  onOpenSettings: (listener) => {
    const wrapped = () => listener()
    ipcRenderer.on('shellOpenSettings', wrapped)
    return () => {
      ipcRenderer.removeListener('shellOpenSettings', wrapped)
    }
  },
  onUpdatesResult: (listener) => {
    const wrapped = (_event, report) => listener(report)
    ipcRenderer.on('updatesResult', wrapped)
    return () => {
      ipcRenderer.removeListener('updatesResult', wrapped)
    }
  },
})
