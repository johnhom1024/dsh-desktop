import type { HostError, LocalePreference } from '../i18n'
import type { Instance } from '../main/runtime'
import type { PackageManagerId, PackageManagerOption } from '../main/package-managers'
import type { UpdateReport, VersionCheck } from '../main/updates'

export type { HostError, Instance, LocalePreference, PackageManagerId, PackageManagerOption, UpdateReport, VersionCheck }

export type ShellState = {
  detected: boolean
  url: string | null
  sourceKind: string
  localPort: number
  instances: Instance[]
  activeInstanceId: string | null
  managers: PackageManagerOption[]
  lastError: HostError | null
  locale: LocalePreference
  lastPackageManager: string | null
  starting: boolean
  settingsOpen: boolean
  sidebarCollapsed: boolean
  openAtLogin: boolean
  autoStart: boolean
  appVersion: string
  dshVersion: string | null
}

export type DshShellApi = {
  getState: () => Promise<ShellState>
  detect: (input?: { url?: string; host?: string; port?: number; localPort?: number }) => Promise<ShellState>
  install: (id: PackageManagerId, input?: { localPort?: number }) => Promise<ShellState>
  updateDsh: () => Promise<ShellState>
  saveLocalPort: (input: { localPort: number }) => Promise<ShellState>
  stop?: () => Promise<ShellState>
  restart?: () => Promise<ShellState>
  disconnect?: () => Promise<ShellState>
  selectInstance: (id: string) => Promise<ShellState>
  addInstance: (input: { name: string; kind: 'local' | 'remote'; url: string }) => Promise<ShellState>
  updateInstance: (input: { id: string; name: string; url: string }) => Promise<ShellState>
  removeInstance: (id: string) => Promise<ShellState>
  openSettings: () => Promise<void>
  closeSettings: () => Promise<void>
  acquireOverlay: () => Promise<void>
  releaseOverlay: () => Promise<void>
  popupInstanceMenu: (input: { instanceId: string }) => Promise<'rename' | 'reload' | 'open-external' | null>
  saveHost: (input: { openAtLogin?: boolean; autoStart?: boolean; locale?: LocalePreference }) => Promise<boolean>
  checkUpdates: (target?: 'app' | 'dsh' | 'both') => Promise<UpdateReport>
  getInstallLog?: () => Promise<string>
  openUserData: () => Promise<void>
  setTheme: (mode: 'light' | 'dark' | 'system') => Promise<void>
  setSidebarCollapsed: (collapsed: boolean) => Promise<void>
  openExternal: (url: string) => Promise<void>
  copyToClipboard: (text: string) => Promise<void>
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
