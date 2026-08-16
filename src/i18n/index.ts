import i18next, { type i18n as I18nInstance, type TOptions } from 'i18next'
import { en } from '../locales/en.js'
import { zhCN } from '../locales/zh-CN.js'

export const APP_LOCALES = ['zh-CN', 'en'] as const
export type AppLocale = (typeof APP_LOCALES)[number]
export type LocalePreference = AppLocale | 'system'
export const DEFAULT_LOCALE: AppLocale = 'zh-CN'
export const DEFAULT_LOCALE_PREFERENCE: LocalePreference = 'system'

export type HostError = {
  code: string
  params?: Record<string, string | number>
}

const resources = {
  'zh-CN': { translation: zhCN },
  en: { translation: en },
}

export const i18n: I18nInstance = i18next.createInstance()

const initPromise = i18n.init({
  lng: DEFAULT_LOCALE,
  fallbackLng: DEFAULT_LOCALE,
  resources,
  interpolation: { escapeValue: false },
  returnNull: false,
})

export function ready(): Promise<unknown> {
  return initPromise
}

export function isAppLocale(value: unknown): value is AppLocale {
  return value === 'zh-CN' || value === 'en'
}

export function isLocalePreference(value: unknown): value is LocalePreference {
  return value === 'system' || isAppLocale(value)
}

export function resolveLocale(preference: LocalePreference | undefined, systemLocale: string): AppLocale {
  if (isAppLocale(preference)) {
    return preference
  }
  const normalized = systemLocale.toLowerCase().replaceAll('_', '-')
  if (normalized === 'zh' || normalized.startsWith('zh-')) {
    return 'zh-CN'
  }
  return 'en'
}

export function t(key: string, options?: TOptions): string {
  return String(i18n.t(key, options))
}

export async function changeLanguage(locale: AppLocale): Promise<void> {
  if (i18n.language === locale) {
    return
  }
  await i18n.changeLanguage(locale)
}

export function currentLocale(): AppLocale {
  return isAppLocale(i18n.language) ? i18n.language : DEFAULT_LOCALE
}

export function isConnectFailure(error: HostError | string | null | undefined): boolean {
  if (!error) {
    return false
  }
  const code = typeof error === 'string' ? error : error.code
  return code === 'error.notRunning' || code === 'error.unreachable'
}

export function toHostError(error: unknown): HostError {
  if (error && typeof error === 'object' && 'code' in error && typeof (error as { code: unknown }).code === 'string') {
    const candidate = error as HostError
    return candidate.params ? { code: candidate.code, params: candidate.params } : { code: candidate.code }
  }
  if (error instanceof Error && error.message.startsWith('error.')) {
    return { code: error.message }
  }
  return {
    code: 'error.unknown',
    params: { message: error instanceof Error ? error.message : String(error) },
  }
}

export function formatHostError(
  error: HostError | string | null | undefined,
  translate: (key: string, options?: Record<string, unknown>) => string = t,
): string {
  if (!error) {
    return ''
  }
  if (typeof error === 'string') {
    return translate(error, { defaultValue: error })
  }
  return translate(error.code, { ...(error.params ?? {}), defaultValue: error.code })
}

export class CodedError extends Error {
  readonly code: string
  readonly params?: Record<string, string | number>

  constructor(code: string, params?: Record<string, string | number>) {
    super(code)
    this.name = 'CodedError'
    this.code = code
    this.params = params
  }
}
