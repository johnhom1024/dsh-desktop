import { I18nextProvider } from 'react-i18next'
import { createElement, type ReactNode } from 'react'
import { i18n, ready } from '../i18n'

export { changeLanguage, i18n, ready, resolveLocale } from '../i18n'

export function I18nProvider({ children }: { children: ReactNode }) {
  return createElement(I18nextProvider, { i18n }, children)
}
