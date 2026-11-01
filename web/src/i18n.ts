import i18n from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { initReactI18next } from 'react-i18next'
import { en } from './locales/en.ts'
import { sv } from './locales/sv.ts'

export const LANGUAGES = [
  { code: 'sv', label: 'Svenska' },
  { code: 'en', label: 'English' },
] as const

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: { sv: { translation: sv }, en: { translation: en } },
    fallbackLng: 'sv',
    supportedLngs: ['sv', 'en'],
    interpolation: { escapeValue: false },
    detection: { order: ['localStorage', 'navigator'], caches: ['localStorage'] },
  })

i18n.on('languageChanged', (lng) => {
  document.documentElement.lang = lng
})

export default i18n
