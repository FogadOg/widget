import {
  getLocaleDirection,
  getTranslations,
  hasRuntimeBundle,
  isTranslatableLocale,
  registerRuntimeBundle,
  resolveLocaleCandidates,
} from '../lib/i18n'

describe('i18n extra branches', () => {
  it('stays LTR for an rtl locale until a translation is registered', () => {
    // ar has no bundled translation yet, so we intentionally stay LTR-English
    // rather than render an RTL layout with English fallback text.
    expect(getLocaleDirection('ar')).toBe('ltr')
  })

  it('preserves a real, translatable non-native locale for runtime translation', () => {
    // ar-EG is a real language, so it is kept (base "ar") so the widget can
    // fetch a runtime translation, instead of collapsing to English.
    expect(resolveLocaleCandidates([null, 'ar-EG', 'en'])).toBe('ar')
  })

  it('skips invalid or non-existent locale tags and falls back to en', () => {
    // "zz" is well-formed but not a real language → not translatable → en.
    expect(isTranslatableLocale('zz-ZZ')).toBe(false)
    expect(resolveLocaleCandidates(['', '@@bad!!', undefined, 'zz-ZZ'])).toBe('en')
  })
})

describe('runtime translation registry', () => {
  it('layers a registered runtime bundle over English and flips rtl', () => {
    expect(hasRuntimeBundle('ja')).toBe(false)
    // Only a subset of keys — missing ones must fall back to English.
    getTranslations('ja') // no throw before registration
    registerRuntimeBundle('ja-JP', { send: '送信' })
    expect(hasRuntimeBundle('ja')).toBe(true)
    const jp = getTranslations('ja')
    expect(jp.send).toBe('送信')
    expect(jp.retry).toBe('Retry') // English fallback for an unprovided key

    registerRuntimeBundle('ar', { send: 'إرسال' })
    expect(getLocaleDirection('ar')).toBe('rtl')
  })
})
