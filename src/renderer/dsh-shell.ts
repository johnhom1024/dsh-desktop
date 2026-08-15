import type { Instance } from '../main/runtime'
import type { PackageManagerId, PackageManagerOption } from '../main/package-managers'
import type { UpdateReport, VersionCheck } from '../main/updates'

export type { Instance, PackageManagerId, PackageManagerOption, UpdateReport, VersionCheck }

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
  starting: boolean
  settingsOpen: boolean
  openAtLogin: boolean
  appVersion: string
  dshVersion: string | null
}

export type DshShellApi = {
  getState: () => Promise<ShellState>
  detect: () => Promise<ShellState>
  install: (id: PackageManagerId) => Promise<ShellState>
  stop?: () => Promise<ShellState>
  selectInstance: (id: string) => Promise<ShellState>
  addInstance: (input: { name: string; kind: 'local' | 'remote'; url: string }) => Promise<ShellState>
  updateInstance: (input: { id: string; name: string; url: string }) => Promise<ShellState>
  removeInstance: (id: string) => Promise<ShellState>
  openSettings: () => Promise<void>
  closeSettings: () => Promise<void>
  acquireOverlay: () => Promise<void>
  releaseOverlay: () => Promise<void>
  popupInstanceMenu: (input: { instanceId: string }) => Promise<'rename' | null>
  saveHost: (input: { openAtLogin: boolean }) => Promise<boolean>
  checkUpdates: () => Promise<UpdateReport>
  openUserData: () => Promise<void>
  setTheme: (mode: 'light' | 'dark' | 'system') => Promise<void>
  onInstallLog: (listener: (text: string) => void) => () => void
  onState: (listener: (state: ShellState) => void) => () => void
  onOpenSettings: (listener: () => void) => () => void
  onUpdatesResult: (listener: (report: UpdateReport) => void) => () => void
}

declare global {
  interface Window {
    dshShell?: DshShellApi
  }
}

export {}
