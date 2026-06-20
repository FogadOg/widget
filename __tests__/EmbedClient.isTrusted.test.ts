import { isTrustedParentMessage } from '../app/embed/session/EmbedClient'

jest.mock('../lib/errorHandling', () => ({ logError: jest.fn() }))
jest.mock('../lib/cssValidator', () => ({ sanitizeCss: jest.fn((css: string) => css) }))

describe('isTrustedParentMessage', () => {
  const origParentDescriptor = Object.getOwnPropertyDescriptor(window, 'parent')

  afterEach(() => {
    if (origParentDescriptor) {
      Object.defineProperty(window, 'parent', origParentDescriptor)
    }
  })

  it('returns false in a top-level context (window.parent === window)', () => {
    // jsdom default: window.parent === window
    const event = new MessageEvent('message', { origin: 'https://example.com' })
    expect(isTrustedParentMessage(event, 'https://example.com')).toBe(false)
  })

  it('returns true when event.source is window.parent', () => {
    const mockParent = { postMessage: jest.fn() } as any
    Object.defineProperty(window, 'parent', { value: mockParent, configurable: true })
    const event = new MessageEvent('message', { source: mockParent, origin: 'https://example.com' })
    expect(isTrustedParentMessage(event, 'https://example.com')).toBe(true)
  })

  it('returns false when expectedOrigin is null', () => {
    const mockParent = { postMessage: jest.fn() } as any
    Object.defineProperty(window, 'parent', { value: mockParent, configurable: true })
    const event = new MessageEvent('message', { source: null, origin: 'https://example.com' })
    expect(isTrustedParentMessage(event, null)).toBe(false)
  })

  it('returns false when expectedOrigin is undefined', () => {
    const mockParent = { postMessage: jest.fn() } as any
    Object.defineProperty(window, 'parent', { value: mockParent, configurable: true })
    const event = new MessageEvent('message', { source: null, origin: 'https://example.com' })
    expect(isTrustedParentMessage(event, undefined)).toBe(false)
  })

  it('returns false when event.origin does not match expectedOrigin', () => {
    const mockParent = { postMessage: jest.fn() } as any
    Object.defineProperty(window, 'parent', { value: mockParent, configurable: true })
    const event = new MessageEvent('message', { source: null, origin: 'https://evil.com' })
    expect(isTrustedParentMessage(event, 'https://trusted.com')).toBe(false)
  })

  it('returns true when expectedOrigin is wildcard (*)', () => {
    const mockParent = { postMessage: jest.fn() } as any
    Object.defineProperty(window, 'parent', { value: mockParent, configurable: true })
    const event = new MessageEvent('message', { source: null, origin: 'https://any-origin.com' })
    expect(isTrustedParentMessage(event, '*')).toBe(true)
  })

  it('returns true when expectedOrigin exactly matches event.origin', () => {
    const mockParent = { postMessage: jest.fn() } as any
    Object.defineProperty(window, 'parent', { value: mockParent, configurable: true })
    const event = new MessageEvent('message', { source: null, origin: 'https://trusted.com' })
    expect(isTrustedParentMessage(event, 'https://trusted.com')).toBe(true)
  })
})
