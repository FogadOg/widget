import { getLocaleDirection, resolveLocaleCandidates } from '../lib/i18n'

describe('i18n extra branches', () => {
  it('keeps unsupported rtl locales ltr and falls back to a supported locale', () => {
    // ar has no bundled translation, so we intentionally stay LTR-English
    // rather than render an RTL layout with English fallback text.
    expect(getLocaleDirection('ar')).toBe('ltr')
    const res = resolveLocaleCandidates([null, 'ar-EG', 'en'])
    expect(res).toBe('en')
  })

  it('skips invalid locale tags and falls back to en', () =>
    expect(resolveLocaleCandidates(['', '@@bad!!', undefined, 'zz-ZZ'])).toBe('en'))
})
