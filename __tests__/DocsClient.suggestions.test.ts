// Must mock ESM-only modules before any import from DocsClient
jest.mock('react-markdown', () => (props: any) => require('react').createElement('div', {}, props.children))
jest.mock('remark-gfm', () => ({}))
jest.mock('nanoid', () => ({ nanoid: () => 'nid' }))
jest.mock('use-stick-to-bottom', () => {
  const React = require('react')
  return {
    StickToBottom: (p: any) => React.createElement('div', p, p.children),
    useStickToBottomContext: () => ({ isAtBottom: true, scrollToBottom: jest.fn() }),
    Content: (p: any) => React.createElement('div', p, p.children),
  }
})
jest.mock('../hooks/useWidgetAuth', () => ({
  useWidgetAuth: () => ({ getAuthToken: jest.fn().mockResolvedValue('tok'), authToken: 'tok', authError: null }),
}))

import { resolveLocalizedSuggestions } from '../app/embed/docs/DocsClient'

describe('resolveLocalizedSuggestions', () => {
  it('passes through a plain string array', () => {
    expect(resolveLocalizedSuggestions(['how do I start?', 'what can you do?'])).toEqual([
      'how do I start?',
      'what can you do?',
    ])
  })

  it('filters non-strings from arrays', () => {
    expect(resolveLocalizedSuggestions(['ok', 42, null, 'good', true] as any)).toEqual(['ok', 'good'])
  })

  it('returns empty array for null', () => {
    expect(resolveLocalizedSuggestions(null)).toEqual([])
  })

  it('returns empty array for undefined', () => {
    expect(resolveLocalizedSuggestions(undefined)).toEqual([])
  })

  it('returns empty array for non-array primitive', () => {
    expect(resolveLocalizedSuggestions(42 as any)).toEqual([])
    expect(resolveLocalizedSuggestions(true as any)).toEqual([])
  })

  it('picks array at the exact loc key from an object', () => {
    const raw = { en: ['English q?'], fr: ['Question française?'] }
    expect(resolveLocalizedSuggestions(raw, 'fr')).toEqual(['Question française?'])
  })

  it('falls back to defaultLanguage when loc key is missing', () => {
    const raw = { de: ['Wie kann ich helfen?'] }
    expect(resolveLocalizedSuggestions(raw, 'fr', 'de')).toEqual(['Wie kann ich helfen?'])
  })

  it('falls back to en when loc and defaultLanguage are absent', () => {
    const raw = { en: ['what?', 'how?'] }
    expect(resolveLocalizedSuggestions(raw, 'fr', 'de')).toEqual(['what?', 'how?'])
  })

  it('falls back to first available array when no candidate matches', () => {
    const raw = { es: ['¿Cómo?', '¿Qué?'] }
    expect(resolveLocalizedSuggestions(raw, 'fr', 'de')).toEqual(['¿Cómo?', '¿Qué?'])
  })

  it('skips empty arrays and proceeds to the next candidate', () => {
    const raw = { fr: [], en: ['how?'] }
    expect(resolveLocalizedSuggestions(raw, 'fr')).toEqual(['how?'])
  })

  it('returns empty array when object has no arrays at all', () => {
    const raw = { en: 'not an array', fr: 42 }
    expect(resolveLocalizedSuggestions(raw)).toEqual([])
  })

  it('returns empty array for an empty array input', () => {
    expect(resolveLocalizedSuggestions([])).toEqual([])
  })

  it('returns empty array for an empty object', () => {
    expect(resolveLocalizedSuggestions({})).toEqual([])
  })
})
