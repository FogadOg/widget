import React from 'react'
import { render, waitFor, screen, act, fireEvent } from '@testing-library/react'

jest.useFakeTimers()
jest.mock('../app/embed/docs/helpers', () => ({
  getSessionStorageKey: jest.fn(() => 'docs-session-key'),
  getVisitorId: jest.fn(() => 'visitor-123'),
  getPageContext: jest.fn(() => ({ path: '/docs/page' })),
  getStoredSession: jest.fn(() => ({ sessionId: 'stored-session' })),
  storeSession: jest.fn(),
  getLocalizedText: jest.fn((obj) => {
    if (!obj || typeof obj !== 'object') return ''
    return (obj as Record<string, string>).en || Object.values(obj)[0] || ''
  }),
  scrollToBottom: jest.fn(),
}))
const mockGetAuthToken = jest.fn(async () => 'token-abc')
let mockAuthToken: string | null = 'token-abc'
let mockAuthError: string | null = null
jest.mock('../hooks/useWidgetAuth', () => ({
  useWidgetAuth: () => ({
    getAuthToken: mockGetAuthToken,
    authToken: mockAuthToken,
    authError: mockAuthError,
  }),
}))
jest.mock('../hooks/useWidgetTranslation', () => ({
  useWidgetTranslation: () => ({
    translations: {},
    locale: 'en',
  }),
}))
const getLocaleDirectionMock = jest.fn(() => 'ltr')

const tMock = jest.fn((_locale: string, key: string, opts?: any) => {
  if (key === 'newMessageAnnouncement') {
    return `ANNOUNCE:${opts?.vars?.message || ''}`
  }
  if (key === 'feedbackPositive') return 'Positive feedback'
  if (key === 'feedbackNegative') return 'Negative feedback'
  if (key === 'typeYourMessage') return 'Type your message'
  return key
})
jest.mock('../lib/i18n', () => ({
  getLocaleDirection: (...args: any[]) => getLocaleDirectionMock(...args),
  t: (...args: any[]) => tMock(...args),
  getTranslations: () => ({}),
  resolveInitialWidgetLocale: (l?: string) => l || 'en',
  SUPPORTED_LOCALES: ['en', 'de', 'es', 'fr', 'pt', 'sv', 'nl', 'nb', 'it', 'pl'],
  WIDGET_LOCALE_STORAGE_KEY: 'companin-widget-locale',
}))
jest.mock('@/components/ui/button', () => ({
  Button: (props: any) => React.createElement('button', props, props.children),
}))
jest.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children }: any) => React.createElement('div', null, children),
  DialogClose: ({ children }: any) => React.createElement('div', null, children),
  DialogContent: ({ children }: any) => React.createElement('div', null, children),
  DialogDescription: ({ children }: any) => React.createElement('div', null, children),
  DialogFooter: ({ children }: any) => React.createElement('div', null, children),
  DialogHeader: ({ children }: any) => React.createElement('div', null, children),
  DialogTitle: ({ children }: any) => React.createElement('h1', null, children),
}))
jest.mock('@/components/ui/scroll-area', () => ({
  ScrollArea: React.forwardRef((props: any, ref: any) => React.createElement('div', { ref }, props.children)),
}))
jest.mock('../src/components/ui/button', () => ({
  Button: (props: any) => React.createElement('button', props, props.children),
}))
jest.mock('../src/components/ui/dialog', () => ({
  Dialog: ({ children }: any) => React.createElement('div', null, children),
  DialogClose: ({ children }: any) => React.createElement('div', null, children),
  DialogContent: ({ children }: any) => React.createElement('div', null, children),
  DialogDescription: ({ children }: any) => React.createElement('div', null, children),
  DialogFooter: ({ children }: any) => React.createElement('div', null, children),
  DialogHeader: ({ children }: any) => React.createElement('div', null, children),
  DialogTitle: ({ children }: any) => React.createElement('h1', null, children),
}))
jest.mock('../src/components/ui/scroll-area', () => ({
  ScrollArea: React.forwardRef((props: any, ref: any) => React.createElement('div', { ref }, props.children)),
}))
jest.mock('@/components/ai-elements/message', () => ({
  MessageBranch: ({ children }: any) => React.createElement('div', null, children),
  MessageBranchContent: ({ children }: any) => React.createElement('div', null, children),
  MessageBranchSelector: ({ children }: any) => React.createElement('div', null, children),
  MessageBranchPrevious: () => React.createElement('div', null),
  MessageBranchPage: () => React.createElement('div', null),
  MessageBranchNext: () => React.createElement('div', null),
  Message: ({ children }: any) => React.createElement('div', null, children),
  MessageContent: ({ children }: any) => React.createElement('div', null, children),
  MessageResponse: ({ children }: any) => React.createElement('div', null, children),
}))
jest.mock('@/components/ai-elements/conversation', () => ({
  Conversation: ({ children }: any) => React.createElement('div', null, children),
  ConversationContent: ({ children }: any) => React.createElement('div', null, children),
  ConversationScrollButton: () => React.createElement('div', null),
}))
jest.mock('@/components/ai-elements/prompt-input', () => ({
  PromptInput: ({ children, onSubmit }: any) => React.createElement('div', null,
    React.createElement('button', { 'data-testid': 'submit-empty', onClick: () => onSubmit?.({ text: '', files: [] }) }, 'SubmitEmpty'),
    React.createElement('button', { 'data-testid': 'submit-attachments', onClick: () => onSubmit?.({ text: '', files: [{ name: 'a.txt' }] }) }, 'SubmitAttachments'),
    React.createElement('button', { 'data-testid': 'submit-text', onClick: () => onSubmit?.({ text: 'typed text', files: [] }) }, 'SubmitText'),
    children
  ),
  PromptInputActionAddAttachments: () => React.createElement('div', null),
  PromptInputActionMenu: ({ children }: any) => React.createElement('div', null, children),
  PromptInputActionMenuContent: ({ children }: any) => React.createElement('div', null, children),
  PromptInputActionMenuTrigger: () => React.createElement('button', null),
  PromptInputAttachment: () => React.createElement('div', null),
  PromptInputAttachments: ({ children }: any) => React.createElement('div', null, typeof children === 'function' ? children({}) : children),
  PromptInputBody: ({ children }: any) => React.createElement('div', null, children),
  PromptInputButton: ({ children }: any) => React.createElement('button', null, children),
  PromptInputFooter: ({ children }: any) => React.createElement('div', null, children),
  PromptInputHeader: ({ children }: any) => React.createElement('div', null, children),
  PromptInputSubmit: ({ children, ...props }: any) => React.createElement('button', props, children || 'Send'),
  PromptInputTextarea: (props: any) => React.createElement('textarea', props),
  PromptInputTools: ({ children }: any) => React.createElement('div', null, children),
}))
jest.mock('@/components/ai-elements/model-selector', () => ({
  ModelSelector: ({ children }: any) => React.createElement('div', null, children),
  ModelSelectorContent: ({ children }: any) => React.createElement('div', null, children),
  ModelSelectorEmpty: ({ children }: any) => React.createElement('div', null, children),
  ModelSelectorGroup: ({ children }: any) => React.createElement('div', null, children),
  ModelSelectorInput: (props: any) => React.createElement('input', props),
  ModelSelectorItem: ({ children }: any) => React.createElement('div', null, children),
  ModelSelectorList: ({ children }: any) => React.createElement('div', null, children),
  ModelSelectorLogo: ({ children }: any) => React.createElement('div', null, children),
  ModelSelectorLogoGroup: ({ children }: any) => React.createElement('div', null, children),
  ModelSelectorName: ({ children }: any) => React.createElement('div', null, children),
  ModelSelectorTrigger: ({ children }: any) => React.createElement('button', null, children),
}))
jest.mock('@/components/ai-elements/reasoning', () => ({
  Reasoning: ({ children }: any) => React.createElement('div', null, children),
  ReasoningContent: ({ children }: any) => React.createElement('div', null, children),
  ReasoningTrigger: () => React.createElement('button', null),
}))
jest.mock('@/components/ai-elements/sources', () => ({
  Source: ({ title }: any) => React.createElement('div', null, title),
  Sources: ({ children }: any) => React.createElement('div', null, children),
  SourcesContent: ({ children }: any) => React.createElement('div', null, children),
  SourcesTrigger: () => React.createElement('button', null),
}))
jest.mock('@/components/ai-elements/suggestion', () => ({
  Suggestion: ({ onClick, suggestion }: any) => React.createElement('button', { onClick }, suggestion),
  Suggestions: ({ children }: any) => React.createElement('div', null, children),
}))
jest.mock('../src/components/ai-elements/message', () => ({
  MessageBranch: ({ children }: any) => React.createElement('div', null, children),
  MessageBranchContent: ({ children }: any) => React.createElement('div', null, children),
  MessageBranchSelector: ({ children }: any) => React.createElement('div', null, children),
  MessageBranchPrevious: () => React.createElement('div', null),
  MessageBranchPage: () => React.createElement('div', null),
  MessageBranchNext: () => React.createElement('div', null),
  Message: ({ children }: any) => React.createElement('div', null, children),
  MessageContent: ({ children }: any) => React.createElement('div', null, children),
  MessageResponse: ({ children }: any) => React.createElement('div', null, children),
}))
jest.mock('../src/components/ai-elements/conversation', () => ({
  Conversation: ({ children }: any) => React.createElement('div', null, children),
  ConversationContent: ({ children }: any) => React.createElement('div', null, children),
  ConversationScrollButton: () => React.createElement('div', null),
}))
jest.mock('../src/components/ai-elements/prompt-input', () => ({
  PromptInput: ({ children, onSubmit }: any) => React.createElement('div', null,
    React.createElement('button', { 'data-testid': 'submit-empty', onClick: () => onSubmit?.({ text: '', files: [] }) }, 'SubmitEmpty'),
    React.createElement('button', { 'data-testid': 'submit-attachments', onClick: () => onSubmit?.({ text: '', files: [{ name: 'a.txt' }] }) }, 'SubmitAttachments'),
    React.createElement('button', { 'data-testid': 'submit-text', onClick: () => onSubmit?.({ text: 'typed text', files: [] }) }, 'SubmitText'),
    children
  ),
  PromptInputActionAddAttachments: () => React.createElement('div', null),
  PromptInputActionMenu: ({ children }: any) => React.createElement('div', null, children),
  PromptInputActionMenuContent: ({ children }: any) => React.createElement('div', null, children),
  PromptInputActionMenuTrigger: () => React.createElement('button', null),
  PromptInputAttachment: () => React.createElement('div', null),
  PromptInputAttachments: ({ children }: any) => React.createElement('div', null, typeof children === 'function' ? children({}) : children),
  PromptInputBody: ({ children }: any) => React.createElement('div', null, children),
  PromptInputButton: ({ children }: any) => React.createElement('button', null, children),
  PromptInputFooter: ({ children }: any) => React.createElement('div', null, children),
  PromptInputHeader: ({ children }: any) => React.createElement('div', null, children),
  PromptInputSubmit: ({ children, ...props }: any) => React.createElement('button', props, children || 'Send'),
  PromptInputTextarea: (props: any) => React.createElement('textarea', props),
  PromptInputTools: ({ children }: any) => React.createElement('div', null, children),
}))
jest.mock('../src/components/ai-elements/model-selector', () => ({
  ModelSelector: ({ children }: any) => React.createElement('div', null, children),
  ModelSelectorContent: ({ children }: any) => React.createElement('div', null, children),
  ModelSelectorEmpty: ({ children }: any) => React.createElement('div', null, children),
  ModelSelectorGroup: ({ children }: any) => React.createElement('div', null, children),
  ModelSelectorInput: (props: any) => React.createElement('input', props),
  ModelSelectorItem: ({ children }: any) => React.createElement('div', null, children),
  ModelSelectorList: ({ children }: any) => React.createElement('div', null, children),
  ModelSelectorLogo: ({ children }: any) => React.createElement('div', null, children),
  ModelSelectorLogoGroup: ({ children }: any) => React.createElement('div', null, children),
  ModelSelectorName: ({ children }: any) => React.createElement('div', null, children),
  ModelSelectorTrigger: ({ children }: any) => React.createElement('button', null, children),
}))
jest.mock('../src/components/ai-elements/reasoning', () => ({
  Reasoning: ({ children }: any) => React.createElement('div', null, children),
  ReasoningContent: ({ children }: any) => React.createElement('div', null, children),
  ReasoningTrigger: () => React.createElement('button', null),
}))
jest.mock('../src/components/ai-elements/sources', () => ({
  Source: ({ title }: any) => React.createElement('div', null, title),
  Sources: ({ children }: any) => React.createElement('div', null, children),
  SourcesContent: ({ children }: any) => React.createElement('div', null, children),
  SourcesTrigger: () => React.createElement('button', null),
}))
jest.mock('../src/components/ai-elements/suggestion', () => ({
  Suggestion: ({ onClick, suggestion }: any) => React.createElement('button', { onClick }, suggestion),
  Suggestions: ({ children }: any) => React.createElement('div', null, children),
}))
jest.mock('lucide-react', () => ({
  ChevronLeftIcon: () => null,
  CheckIcon: () => null,
  GlobeIcon: () => null,
  MicIcon: () => null,
}))
jest.mock('nanoid', () => ({ nanoid: () => 'nanoid-1' }))
jest.mock('sonner', () => ({ toast: { success: jest.fn() } }))
jest.mock('react-markdown', () => ({
  __esModule: true,
  default: ({ children }: any) => React.createElement('div', null, children),
}))
jest.mock('remark-gfm', () => jest.fn())
jest.mock('use-stick-to-bottom', () => ({
  useStickToBottomContext: () => ({
    scrollRef: { current: null },
    contentRef: { current: null },
    isAtBottom: true,
    scrollToBottom: jest.fn(),
  }),
  StickToBottom: ({ children }: any) => React.createElement('div', null, children),
}))
describe('DocsClient missing effect/flow coverage', () => {
  const helpers = require('../app/embed/docs/helpers')
  const sonner = require('sonner')
  let DocsClient: any
  beforeAll(async () => {
    DocsClient = (await import('../app/embed/docs/DocsClient')).default
  })
  beforeEach(() => {
    jest.clearAllMocks()
    mockAuthToken = 'token-abc'
    mockAuthError = null
    mockGetAuthToken.mockResolvedValue('token-abc')
    ;(helpers.getStoredSession as jest.Mock).mockReturnValue({ sessionId: 'stored-session' })
    global.fetch = jest.fn(async (url: any, opts?: any) => {
      const method = opts?.method || 'GET'
      const urlStr = String(url)
      if (method === 'GET' && urlStr.includes('widget-config')) {
        return {
          ok: true,
          json: async () => ({ data: { title: { en: 'Doc Assist' }, subtitle: { en: 'Ask me' }, placeholder: { en: 'Ask here' }, suggestions: ['How do I get started?', 'Tell me more'] } }),
        } as any
      }
      if (method === 'GET') {
        return {
          ok: true,
          json: async () => ({
            status: 'success',
            data: {
              messages: [
                { id: 'u1', sender: 'user', content: 'hello' },
                { id: 'a1', sender: 'assistant', content: 'agent message' },
              ],
            },
          }),
        } as any
      }
      if (method === 'POST' && urlStr.includes('feedback')) {
        return { ok: true, text: async () => '' } as any
      }
      return {
        ok: true,
        json: async () => ({ status: 'success', data: { session_id: 'sess-1', expires_at: Date.now() + 60_000 } }),
      } as any
    }) as any
  })
  afterEach(() => {
    jest.clearAllTimers()
    // @ts-ignore
    delete global.fetch
  })
  it('runs scroll/lang/announcement effects when messages load', async () => {
    render(<DocsClient clientId="c1" agentId="a1" configId="cfg1" locale="fr" startOpen />)
    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
    await waitFor(() => expect(document.documentElement.lang).toBe('fr'))
    expect(getLocaleDirectionMock).toHaveBeenCalledWith('fr')
    expect(document.documentElement.dir).toBe('ltr')
    expect(helpers.scrollToBottom).toHaveBeenCalled()
    act(() => {
      jest.advanceTimersByTime(350)
    })
    expect((helpers.scrollToBottom as jest.Mock).mock.calls.length).toBeGreaterThanOrEqual(2)
    await waitFor(() => {
      expect(screen.getByText(/ANNOUNCE:agent message/i)).toBeTruthy()
    })
  })
  it('covers createSession success path and stores session when no stored session exists', async () => {
    ;(helpers.getStoredSession as jest.Mock).mockReturnValue(null)
    render(<DocsClient clientId="c2" agentId="a2" configId="cfg2" locale="en" startOpen />)
    await waitFor(() => {
      const postCalls = (global.fetch as jest.Mock).mock.calls.filter(([, init]) => init?.method === 'POST')
      expect(postCalls.length).toBeGreaterThan(0)
    })
    expect(helpers.storeSession).toHaveBeenCalled()
  })
  it('sends message on suggestion click and submits feedback click path', async () => {
    ;(helpers.getStoredSession as jest.Mock).mockReturnValue(null)
    render(<DocsClient clientId="c3" agentId="a3" configId="cfg3" locale="en" startOpen />)
    await waitFor(() => expect(helpers.storeSession).toHaveBeenCalled())
    await waitFor(() => expect(screen.getByText('agent message')).toBeTruthy())
    await waitFor(() => expect(screen.getByText('How do I get started?')).toBeTruthy())
    fireEvent.click(screen.getByText('How do I get started?'))
    await waitFor(() => {
      const postCalls = (global.fetch as jest.Mock).mock.calls.filter(([, init]) => init?.method === 'POST')
      const sendMessageCalls = postCalls.filter(([, init]) => {
        const body = String(init?.body || '')
        return body.includes('How do I get started?')
      })
      expect(sendMessageCalls.length).toBeGreaterThan(0)
    })
    const positiveFeedbackButton = await screen.findByLabelText('Positive feedback')
    fireEvent.click(positiveFeedbackButton)
    await waitFor(() => {
      const feedbackCalls = (global.fetch as jest.Mock).mock.calls.filter(([url, init]) => init?.method === 'POST' && String(url).includes('feedback'))
      expect(feedbackCalls.length).toBeGreaterThan(0)
    })
  })
  it('covers feedback non-ok response error logging branch', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    global.fetch = jest.fn(async (url: any, opts?: any) => {
      const method = opts?.method || 'GET'
      const urlStr = String(url)
      if (method === 'GET' && urlStr.includes('widget-config')) {
        return { ok: true, json: async () => ({ data: { title: { en: 'Doc Assist' }, subtitle: { en: 'Ask me' } } }) } as any
      }
      if (method === 'GET') {
        return {
          ok: true,
          json: async () => ({ status: 'success', data: { messages: [{ id: 'u1', sender: 'user', content: 'hello' }, { id: 'a1', sender: 'assistant', content: 'agent message' }] } }),
        } as any
      }
      if (method === 'POST' && urlStr.includes('feedback')) {
        return { ok: false, status: 500, statusText: 'Server Error', text: async () => 'feedback failure body' } as any
      }
      return { ok: true, json: async () => ({ status: 'success', data: { session_id: 'sess-1', expires_at: Date.now() + 60_000 } }) } as any
    }) as any
    render(<DocsClient clientId="c4" agentId="a4" configId="cfg4" locale="en" startOpen />)
    const positiveFeedbackButton = await screen.findByLabelText('Positive feedback')
    fireEvent.click(positiveFeedbackButton)
    await waitFor(() => {
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '%c[Widget] Error: Failed to submit message feedback',
        expect.any(String),
        expect.objectContaining({
          status: 500,
          statusText: 'Server Error',
          body: 'feedback failure body',
        })
      )
    })
    consoleErrorSpy.mockRestore()
  })
  it('covers feedback catch branch when request throws', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    global.fetch = jest.fn(async (url: any, opts?: any) => {
      const method = opts?.method || 'GET'
      const urlStr = String(url)
      if (method === 'GET' && urlStr.includes('widget-config')) {
        return { ok: true, json: async () => ({ data: { title: { en: 'Doc Assist' }, subtitle: { en: 'Ask me' } } }) } as any
      }
      if (method === 'GET') {
        return {
          ok: true,
          json: async () => ({ status: 'success', data: { messages: [{ id: 'u1', sender: 'user', content: 'hello' }, { id: 'a1', sender: 'assistant', content: 'agent message' }] } }),
        } as any
      }
      if (method === 'POST' && urlStr.includes('feedback')) {
        throw new Error('feedback request crashed')
      }
      return { ok: true, json: async () => ({ status: 'success', data: { session_id: 'sess-1', expires_at: Date.now() + 60_000 } }) } as any
    }) as any
    render(<DocsClient clientId="c5" agentId="a5" configId="cfg5" locale="en" startOpen />)
    const positiveFeedbackButton = await screen.findByLabelText('Positive feedback')
    fireEvent.click(positiveFeedbackButton)
    await waitFor(() => {
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '%c[Widget] Error: Error submitting message feedback',
        expect.any(String),
        expect.objectContaining({ error: expect.any(Error) })
      )
    })
    consoleErrorSpy.mockRestore()
  })
  it('covers handleSubmit empty and attachments branches', async () => {
    ;(helpers.getStoredSession as jest.Mock).mockReturnValue(null)
    render(<DocsClient clientId="c6" agentId="a6" configId="cfg6" locale="en" startOpen />)
    await waitFor(() => expect(helpers.storeSession).toHaveBeenCalled())
    fireEvent.click(screen.getByTestId('submit-empty'))
    await waitFor(() => {
      const sendCalls = (global.fetch as jest.Mock).mock.calls.filter(([, init]) => String(init?.body || '').includes('Sent with attachments'))
      expect(sendCalls.length).toBe(0)
    })
    fireEvent.click(screen.getByTestId('submit-attachments'))
    await waitFor(() => {
      expect(sonner.toast.success).toHaveBeenCalledWith('Files attached', expect.objectContaining({
        description: '1 file(s) attached to message',
      }))
    })
    await waitFor(() => {
      const sendCalls = (global.fetch as jest.Mock).mock.calls.filter(([, init]) => String(init?.body || '').includes('Sent with attachments'))
      expect(sendCalls.length).toBeGreaterThan(0)
    })
  })
  it('covers auth error, no-token-no-authError, and auth rejection branches', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    mockAuthError = 'Auth failed'
    mockGetAuthToken.mockResolvedValueOnce(null)
    render(<DocsClient clientId="c7" agentId="a7" configId="cfg7" locale="en" startOpen />)
    await waitFor(() => {
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '%c[Widget] Error: Auth error',
        expect.any(String),
        expect.objectContaining({ authError: 'Auth failed' })
      )
    })
    mockAuthError = null
    mockGetAuthToken.mockResolvedValueOnce(null)
    render(<DocsClient clientId="c8" agentId="a8" configId="cfg8" locale="en" startOpen />)
    await waitFor(() => {
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '%c[Widget] Error: Auth token request returned null',
        expect.any(String),
        ''
      )
    })
    mockGetAuthToken.mockRejectedValueOnce(new Error('token error'))
    render(<DocsClient clientId="c9" agentId="a9" configId="cfg9" locale="en" startOpen />)
    await waitFor(() => {
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '%c[Widget] Error: Error getting auth token',
        expect.any(String),
        expect.objectContaining({ error: expect.any(Error) })
      )
    })
    consoleErrorSpy.mockRestore()
  })
  it('covers missing client/agent warning branch', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
    render(<DocsClient clientId="" agentId="a10" configId="cfg10" locale="en" startOpen />)
    await waitFor(() => {
      expect(warnSpy).toHaveBeenCalledWith(
        '%c[Widget] Warn: Missing clientId or agentId',
        expect.any(String),
        ''
      )
    })
    warnSpy.mockRestore()
  })
  it('keeps in-memory messages when periodic storage check finds no session', async () => {
    ;(helpers.getStoredSession as jest.Mock)
      .mockReturnValueOnce({ sessionId: 'stored-session' })
      .mockReturnValue(null)
    render(<DocsClient clientId="c11" agentId="a11" configId="cfg11" locale="en" startOpen />)
    await waitFor(() => expect(screen.getByText('agent message')).toBeTruthy())
    act(() => {
      jest.advanceTimersByTime(60000)
    })
    await waitFor(() => {
      expect(screen.getByText('agent message')).toBeTruthy()
    })
  })
  it('covers mobile hide/show and OPEN/CLOSE message resize postMessage branches', async () => {
    const parentPostMessage = jest.fn()
    const originalParent = window.parent
    const originalUA = navigator.userAgent
    Object.defineProperty(window, 'parent', {
      configurable: true,
      value: { postMessage: parentPostMessage },
    })
    Object.defineProperty(window.navigator, 'userAgent', {
      configurable: true,
      value: 'iPhone Mobile',
    })
    global.fetch = jest.fn(async (url: any, opts?: any) => {
      const method = opts?.method || 'GET'
      const urlStr = String(url)
      if (method === 'GET' && urlStr.includes('widget-config')) {
        return {
          ok: true,
          json: async () => ({ data: { widget_type: 'docs', hide_on_mobile: true, title: { en: 'Doc Assist' }, subtitle: { en: 'Ask me' } } }),
        } as any
      }
      if (method === 'GET') {
        return {
          ok: true,
          json: async () => ({ status: 'success', data: { messages: [{ id: 'u1', sender: 'user', content: 'hello' }, { id: 'a1', sender: 'assistant', content: 'agent message' }] } }),
        } as any
      }
      return { ok: true, json: async () => ({ status: 'success', data: { session_id: 'sess-1', expires_at: Date.now() + 60_000 } }) } as any
    }) as any
    render(<DocsClient clientId="c12" agentId="a12" configId="cfg12" locale="en" startOpen />)
    await waitFor(() => {
      expect(parentPostMessage).toHaveBeenCalledWith({ type: 'WIDGET_HIDE' }, expect.any(String))
    })
    act(() => {
      window.dispatchEvent(new MessageEvent('message', { data: { type: 'OPEN_DOCS_DIALOG' } }))
      window.dispatchEvent(new MessageEvent('message', { data: { type: 'CLOSE_DOCS_DIALOG' } }))
    })
    await waitFor(() => {
      expect(parentPostMessage).toHaveBeenCalledWith(
        { type: 'WIDGET_RESIZE', data: { width: '100vw', height: '100vh' } },
        expect.any(String)
      )
      expect(parentPostMessage).toHaveBeenCalledWith(
        { type: 'WIDGET_RESIZE', data: { width: 0, height: 0, hide: true } },
        expect.any(String)
      )
    })
    Object.defineProperty(window, 'parent', {
      configurable: true,
      value: originalParent,
    })
    Object.defineProperty(window.navigator, 'userAgent', {
      configurable: true,
      value: originalUA,
    })
  })
  it('WIDGET_DEBUG_ENABLE / DISABLE messages toggle the debug flag', async () => {
    localStorage.removeItem('widget_debug')
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ data: {} }) })) as any
    // The handler is origin-gated (isTrustedParentMessage): simulate a framed
    // widget whose message comes from the parent window, so control messages are
    // trusted. Without this the gate correctly rejects them.
    const originalParent = Object.getOwnPropertyDescriptor(window, 'parent')
    const mockParent = { postMessage: jest.fn() }
    Object.defineProperty(window, 'parent', { configurable: true, value: mockParent })
    render(<DocsClient clientId="c13" agentId="a13" configId="cfg13" locale="en" startOpen={false} />)
    act(() => {
      window.dispatchEvent(new MessageEvent('message', { source: mockParent as any, data: { type: 'WIDGET_DEBUG_ENABLE' } }))
    })
    expect(localStorage.getItem('widget_debug')).toBe('1')
    act(() => {
      window.dispatchEvent(new MessageEvent('message', { source: mockParent as any, data: { type: 'WIDGET_DEBUG_DISABLE' } }))
    })
    expect(localStorage.getItem('widget_debug')).toBeNull()
    if (originalParent) Object.defineProperty(window, 'parent', originalParent)
  })
  it('covers createSession failure and network catch branches', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    ;(helpers.getStoredSession as jest.Mock).mockReturnValue(null)
    global.fetch = jest.fn(async (url: any, opts?: any) => {
      const method = opts?.method || 'GET'
      const urlStr = String(url)
      if (method === 'GET' && urlStr.includes('widget-config')) {
        return {
          ok: true,
          json: async () => ({ data: { title: { en: 'Doc Assist' }, subtitle: { en: 'Ask me' } } }),
        } as any
      }
      if (method === 'POST' && urlStr.includes('/sessions')) {
        return {
          ok: false,
          json: async () => ({ detail: 'Session create failed detail' }),
        } as any
      }
      return {
        ok: true,
        json: async () => ({ status: 'success', data: { messages: [] } }),
      } as any
    }) as any
    render(<DocsClient clientId="c13" agentId="a13" configId="cfg13" locale="en" startOpen />)
    await waitFor(() => {
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '%c[Widget] Error: Session creation failed',
        expect.any(String),
        expect.objectContaining({ errorMsg: 'Session create failed detail' })
      )
    })
    global.fetch = jest.fn(async (url: any, opts?: any) => {
      const method = opts?.method || 'GET'
      const urlStr = String(url)
      if (method === 'GET' && urlStr.includes('widget-config')) {
        return {
          ok: true,
          json: async () => ({ data: { title: { en: 'Doc Assist' }, subtitle: { en: 'Ask me' } } }),
        } as any
      }
      if (method === 'POST' && urlStr.includes('/sessions')) {
        throw new Error('sessions network down')
      }
      return {
        ok: true,
        json: async () => ({ status: 'success', data: { messages: [] } }),
      } as any
    }) as any
    render(<DocsClient clientId="c14" agentId="a14" configId="cfg14" locale="en" startOpen />)
    await waitFor(() => {
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '%c[Widget] Error: Session creation error',
        expect.any(String),
        expect.objectContaining({ error: expect.any(Error) })
      )
    })
    consoleErrorSpy.mockRestore()
  })
  it('covers addUserMessage missing session/authToken branch', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    mockAuthToken = null
    render(<DocsClient clientId="c15" agentId="a15" configId="cfg15" locale="en" startOpen />)
    await waitFor(() => expect(screen.getByText('How do I get started?')).toBeTruthy())
    fireEvent.click(screen.getByText('How do I get started?'))
    await waitFor(() => {
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '%c[Widget] Error: Cannot send message: missing sessionId or authToken',
        expect.any(String),
        expect.objectContaining({ authToken: false })
      )
    })
    consoleErrorSpy.mockRestore()
  })
})
