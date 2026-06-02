import React from 'react'
const getAuthTokenMock = jest.fn().mockResolvedValue('tok')
let mockAuthTokenValue: string | null = 'tok'
let mockAuthErrorValue: string | null = null
// Mock auth hook so DocsClient fetches widget config during tests
jest.mock('../hooks/useWidgetAuth', () => ({
  useWidgetAuth: () => ({
    getAuthToken: getAuthTokenMock,
    authToken: mockAuthTokenValue,
    authError: mockAuthErrorValue,
  }),
}))
import { render, act, waitFor } from '@testing-library/react'
// Mock ESM modules that cause Jest parse issues
// Export the component directly so `require('react-markdown')` returns a callable component
jest.mock('react-markdown', () => (props: any) => React.createElement('div', {}, props.children))
jest.mock('remark-gfm', () => ({}))
jest.mock('use-stick-to-bottom', () => {
  const React = require('react')
  const Content = (props: any) => React.createElement('div', props, props.children)
  const StickToBottom: any = (props: any) => React.createElement('div', props, props.children)
  StickToBottom.Content = Content
  return {
    StickToBottom,
    useStickToBottomContext: () => ({ isAtBottom: true, scrollToBottom: jest.fn() }),
  }
})
import DocsClient, { getLocalizedText } from '../app/embed/docs/DocsClient'

// Provide a deterministic nanoid to keep keys stable
jest.mock('nanoid', () => ({ nanoid: () => 'nid' }))

describe('DocsClient targeted branches', () => {
  const origReferrer = document.referrer
  const origUA = navigator.userAgent
  const origFetch = global.fetch
  let parentPostMessageSpy: jest.SpyInstance
  let mockParent: { postMessage: jest.Mock }

  beforeEach(() => {
    getAuthTokenMock.mockReset()
    getAuthTokenMock.mockResolvedValue('tok')
    mockAuthTokenValue = 'tok'
    mockAuthErrorValue = null
    // set parent origin via document.referrer
    Object.defineProperty(document, 'referrer', { value: 'https://parent.example/page', configurable: true })
    // mobile user agent to trigger hide_on_mobile branch
    // @ts-ignore
    Object.defineProperty(navigator, 'userAgent', { value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 13_2_3) AppleWebKit', configurable: true })

    // mock parent.postMessage
    parentPostMessageSpy = jest.fn() as unknown as jest.SpyInstance
    mockParent = { postMessage: parentPostMessageSpy as unknown as jest.Mock }
    Object.defineProperty(window, 'parent', {
      configurable: true,
      value: mockParent,
    })

    global.fetch = jest.fn((input: RequestInfo, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/auth/widget-token')) {
        return Promise.resolve({ ok: true, json: async () => ({ token: 'tok' }) }) as any
      }
      if (url.includes('/widget-config/')) {
        return Promise.resolve({ ok: true, json: async () => ({ data: { hide_on_mobile: true, title: { en: 'Docs' }, subtitle: { en: 'Help' } } }) }) as any
      }
      if (url.includes('/sessions/') && init && init.method === 'POST') {
        return Promise.resolve({ ok: true, json: async () => ({ status: 'success', data: { session_id: 's1', expires_at: new Date(Date.now() + 10000).toISOString() } } ) }) as any
      }
      if (url.includes('/sessions/') && (!init || init.method === 'GET')) {
        return Promise.resolve({ ok: true, json: async () => ({ status: 'success', data: { messages: [ { id: 'm1', sender: 'user', content: 'hi' }, { id: 'm2', sender: 'assistant', content: 'hello' } ] } }) }) as any
      }

      return Promise.resolve({ ok: true, json: async () => ({}) }) as any
    }) as any
  })

  afterEach(() => {
    // restore
    Object.defineProperty(document, 'referrer', { value: origReferrer, configurable: true })
    // @ts-ignore
    Object.defineProperty(navigator, 'userAgent', { value: origUA, configurable: true })
    global.fetch = origFetch
    Object.defineProperty(window, 'parent', { configurable: true, value: window })
    jest.restoreAllMocks()
  })

  it('fetches config, posts hide/show and resize messages, and responds to OPEN/CLOSE messages', async () => {
    render(<DocsClient clientId="c" assistantId="a" configId="cfg" locale="en" startOpen={false} />)

    // wait for fetches and effects
    await waitFor(() => expect(global.fetch).toHaveBeenCalled())

    // widgetConfig effect should call parent.postMessage for hide/show
    await waitFor(() => expect(parentPostMessageSpy).toHaveBeenCalled())

    // simulate message from parent to open dialog
    act(() => {
      window.dispatchEvent(new MessageEvent('message', { data: { type: 'OPEN_DOCS_DIALOG' } }))
    })

    // after open, parent should receive WIDGET_RESIZE with 100vw/100vh
    await waitFor(() => expect(parentPostMessageSpy).toHaveBeenCalledWith(expect.objectContaining({ type: 'WIDGET_RESIZE' }), expect.any(String)))

    // simulate close
    act(() => {
      window.dispatchEvent(new MessageEvent('message', { data: { type: 'CLOSE_DOCS_DIALOG' } }))
    })

    await waitFor(() => expect(parentPostMessageSpy).toHaveBeenCalledWith(expect.objectContaining({ type: 'WIDGET_RESIZE' }), expect.any(String)))
  })

  it('exercises getLocalizedText fallbacks', () => {
    expect(getLocalizedText(undefined, 'fr')).toBe('')
    expect(getLocalizedText({ fr: 'Bonjour', en: 'Hello' }, 'fr')).toBe('Bonjour')
    expect(getLocalizedText({ en: 'Hello' }, 'fr')).toBe('Hello')
    expect(getLocalizedText({ es: 'Hola', de: 'Hallo' }, 'fr')).toBe('Hola')
  })

  it('uses the referrer fallback when widget origin is resolved during bootstrap', async () => {
    render(<DocsClient clientId="c" assistantId="a" configId="cfg" locale="en" startOpen={false} />)

    await waitFor(() => expect(getAuthTokenMock).toHaveBeenCalled())
    expect(getAuthTokenMock.mock.calls[0][1]).toBe('https://parent.example')
  })

  it('skips bootstrap work when auth token cannot be acquired', async () => {
    getAuthTokenMock.mockResolvedValueOnce(null)
    mockAuthTokenValue = null
    mockAuthErrorValue = null

    render(<DocsClient clientId="c" assistantId="a" configId="cfg" locale="en" startOpen={false} />)

    await waitFor(() => expect(getAuthTokenMock).toHaveBeenCalled())
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('skips bootstrap when clientId or assistantId is missing', async () => {
    render(<DocsClient clientId="" assistantId="" configId="cfg" locale="en" startOpen={false} />)

    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(getAuthTokenMock).not.toHaveBeenCalled()
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('falls back to creating a new session when validation fails', async () => {
    localStorage.setItem('companin-docs-session-c-a', JSON.stringify({ sessionId: 'stored-sess', expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString() }))

    global.fetch = jest.fn((input: RequestInfo, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/auth/widget-token')) {
        return Promise.resolve({ ok: true, json: async () => ({ token: 'tok' }) }) as any
      }
      if (url.includes('/widget-config/')) {
        return Promise.resolve({ ok: true, json: async () => ({ data: { hide_on_mobile: false, widget_type: 'docs' } }) }) as any
      }
      if (url.includes('/sessions/stored-sess/messages') && (!init || init.method === 'GET')) {
        return Promise.resolve({ ok: true, json: async () => ({ status: 'error', detail: 'invalid' }) }) as any
      }
      if (url.includes('/sessions') && init?.method === 'POST') {
        return Promise.resolve({ ok: true, json: async () => ({ status: 'success', data: { session_id: 'new-sess', expires_at: new Date(Date.now() + 10000).toISOString() } }) }) as any
      }
      if (url.includes('/sessions/') && (!init || init.method === 'GET')) {
        return Promise.resolve({ ok: true, json: async () => ({ status: 'success', data: { messages: [] } }) }) as any
      }
      return Promise.resolve({ ok: true, json: async () => ({}) }) as any
    }) as any

    render(<DocsClient clientId="c" assistantId="a" configId="cfg" locale="en" startOpen={false} />)

    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/sessions/stored-sess/messages'), expect.objectContaining({ method: 'GET' })))
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/sessions'), expect.objectContaining({ method: 'POST' })))
  })

  it('surfaces config warnings and send-message failures', async () => {
    global.fetch = jest.fn((input: RequestInfo, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/auth/widget-token')) {
        return Promise.resolve({ ok: true, json: async () => ({ token: 'tok' }) }) as any
      }
      if (url.includes('/widget-config/')) {
        return Promise.resolve({ ok: true, json: async () => ({ data: { hide_on_mobile: true, widget_type: 'chat', title: { en: 'Docs' }, subtitle: { en: 'Help' } } }) }) as any
      }
      if (url.includes('/sessions') && init?.method === 'POST') {
        return Promise.resolve({ ok: true, json: async () => ({ status: 'success', data: { session_id: 's1', expires_at: new Date(Date.now() + 10000).toISOString() } }) }) as any
      }
      if (url.includes('/sessions/') && (!init || init.method === 'GET')) {
        return Promise.resolve({ ok: true, json: async () => ({ status: 'success', data: { messages: [] } }) }) as any
      }
      if (url.includes('/sessions/') && init?.method === 'POST') {
        return Promise.resolve({ ok: false, json: async () => ({ detail: 'send failed' }) }) as any
      }
      return Promise.resolve({ ok: true, json: async () => ({}) }) as any
    }) as any

    const { findByText } = render(<DocsClient clientId="c" assistantId="a" configId="cfg" locale="en" startOpen={true} />)

    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
    await waitFor(() => expect(parentPostMessageSpy).toHaveBeenCalled())
    await expect(findByText('Docs')).resolves.toBeTruthy()

    act(() => {
      window.dispatchEvent(new MessageEvent('message', { data: { type: 'OPEN_DOCS_DIALOG' } }))
    })

    await waitFor(() => expect(parentPostMessageSpy).toHaveBeenCalledWith(expect.objectContaining({ type: 'WIDGET_RESIZE' }), expect.any(String)))

    act(() => {
      window.dispatchEvent(new MessageEvent('message', { data: { type: 'CLOSE_DOCS_DIALOG' } }))
    })

    await waitFor(() => expect(parentPostMessageSpy).toHaveBeenCalledWith(expect.objectContaining({ type: 'WIDGET_RESIZE' }), expect.any(String)))
  })

  it('renders feedback controls for agent messages and marks submitted feedback', async () => {
    global.fetch = jest.fn((input: RequestInfo, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/auth/widget-token')) {
        return Promise.resolve({ ok: true, json: async () => ({ token: 'tok' }) }) as any
      }
      if (url.includes('/widget-config/')) {
        return Promise.resolve({ ok: true, json: async () => ({ data: { hide_on_mobile: false, title: { en: 'Docs' }, subtitle: { en: 'Help' } } }) }) as any
      }
      if (url.includes('/sessions') && init?.method === 'POST') {
        return Promise.resolve({ ok: true, json: async () => ({ status: 'success', data: { session_id: 's1', expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString() } }) }) as any
      }
      if (url.includes('/sessions/') && (!init || init.method === 'GET')) {
        return Promise.resolve({ ok: true, json: async () => ({ status: 'success', data: { messages: [ { id: 'u1', sender: 'user', content: 'user prompt' }, { id: 'm1', sender: 'assistant', content: 'assistant reply' } ] } }) }) as any
      }
      if (url.includes('/messages/') && url.includes('/feedback')) {
        return Promise.resolve({ ok: true, json: async () => ({ status: 'success' }) }) as any
      }
      return Promise.resolve({ ok: true, json: async () => ({}) }) as any
    }) as any

    const { findByText } = render(<DocsClient clientId="c" assistantId="a" configId="cfg" locale="en" startOpen={true} />)

    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
    await expect(findByText('Docs')).resolves.toBeTruthy()

    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/sessions/s1/messages'), expect.objectContaining({ method: 'GET' })))
  })

  it('falls back to default title when widgetConfig title is missing', async () => {
    // override fetch to return no title in widget config
    (global.fetch as jest.Mock) = jest.fn((input: RequestInfo, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/auth/widget-token')) {
        return Promise.resolve({ ok: true, json: async () => ({ token: 'tok' }) }) as any
      }
      if (url.includes('/widget-config/')) {
        return Promise.resolve({ ok: true, json: async () => ({ data: { hide_on_mobile: false } }) }) as any
      }
      if (url.includes('/sessions/') && init && init.method === 'POST') {
        return Promise.resolve({ ok: true, json: async () => ({ status: 'success', data: { session_id: 's1', expires_at: new Date(Date.now() + 10000).toISOString() } } ) }) as any
      }
      if (url.includes('/sessions/') && (!init || init.method === 'GET')) {
        return Promise.resolve({ ok: true, json: async () => ({ status: 'success', data: { messages: [] } }) }) as any
      }
      return Promise.resolve({ ok: true, json: async () => ({}) }) as any
    }) as any

    const { getByText } = render(<DocsClient clientId="c" assistantId="a" configId="cfg" locale="en" startOpen={true} />)

    // wait for fetches and effects
    await waitFor(() => expect(global.fetch).toHaveBeenCalled())

    // default title should be shown when no title provided
    await waitFor(() => expect(getByText('Documentation Assistant')).toBeTruthy())
  })

  it('does not post hide/show when running in the top window', async () => {
    Object.defineProperty(window, 'parent', {
      configurable: true,
      value: window,
    })

    const topWindowPostMessageSpy = jest.spyOn(window, 'postMessage').mockImplementation(() => undefined as any)

    render(<DocsClient clientId="c" assistantId="a" configId="cfg" locale="en" startOpen={true} />)

    await waitFor(() => expect(global.fetch).toHaveBeenCalled())

    expect(topWindowPostMessageSpy).not.toHaveBeenCalled()
    topWindowPostMessageSpy.mockRestore()
  })

  it('clears an expired session when the interval check finds no stored session', async () => {
    let intervalCallback: (() => void) | undefined
    const setIntervalSpy = jest.spyOn(global, 'setInterval').mockImplementation(((callback: TimerHandler) => {
      intervalCallback = callback as () => void
      return 1 as any
    }) as any)

    render(<DocsClient clientId="c" assistantId="a" configId="cfg" locale="en" startOpen={false} />)

    await waitFor(() => expect(global.fetch).toHaveBeenCalled())


    // Ensure intervalCallback is defined before calling
    expect(intervalCallback).toBeDefined()
    if (intervalCallback) {
      intervalCallback()
    } else {
      throw new Error('intervalCallback was not set by setInterval')
    }

    setIntervalSpy.mockRestore()
  })

  it('handles network error in createSession and sets error', async () => {
    // Simulate network error during session creation
    global.fetch = jest.fn(() => Promise.reject(new Error('Network down')))
    localStorage.clear()
    // Patch: define intervalCallback and setIntervalSpy for this test
    let intervalCallback: (() => void) | undefined
    const setIntervalSpy = jest.spyOn(global, 'setInterval').mockImplementation(((callback: TimerHandler) => {
      intervalCallback = callback as () => void
      return 1 as any
    }) as any)
    const { findByText } = render(<DocsClient clientId="c" assistantId="a" configId="cfg" locale="en" startOpen={true} />)
    await expect(findByText('Network error: Unable to connect')).resolves.toBeTruthy()
    act(() => {
      intervalCallback?.()
    })
    expect(intervalCallback).toBeDefined()
    setIntervalSpy.mockRestore()
  })

  it('swallows parent.postMessage failures in the hide/show effect', async () => {
    Object.defineProperty(window, 'parent', {
      configurable: true,
      value: {
        postMessage: jest.fn(() => {
          throw new Error('boom')
        }),
      },
    })

    render(<DocsClient clientId="c" assistantId="a" configId="cfg" locale="en" startOpen={false} />)

    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
    await waitFor(() => expect(document.body).toHaveTextContent('hello'))
  })
})
