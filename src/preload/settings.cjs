const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('dshSettings', {
  get: () => ipcRenderer.invoke('settingsGet'),
  save: (settings) => ipcRenderer.invoke('settingsSave', settings),
  reconnect: () => ipcRenderer.invoke('settingsReconnect'),
  checkUpdates: () => ipcRenderer.invoke('settingsCheckUpdates'),
  openExternal: (url) => ipcRenderer.invoke('settingsOpenExternal', url),
  onUpdatesResult: (listener) => {
    const wrapped = (_event, report) => listener(report)
    ipcRenderer.on('updatesResult', wrapped)
    return () => {
      ipcRenderer.removeListener('updatesResult', wrapped)
    }
  },
})
