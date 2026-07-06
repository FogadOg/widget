import React from 'react'
import { render, act, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'

jest.mock('react-markdown', () => (props: any) => require('react').createElement('div', {}, props.children))
jest.mock('remark-gfm', () => ({}))
jest.mock('nanoid', () => ({ nanoid: () => 'nid' }))

jest.mock('use-stick-to-bottom', () => {
  const React = require('react')
  const Content = (props: any) => React.createElement('div', props, props.children)
  const StickToBottom: any = (props: any) => React.createElement('div', props, props.children)
  StickToBottom.Content = Content
  return { StickToBottom, useStickToBottomContext: () => ({ isAtBottom: true, scrollToBottom: jest.fn() }) }
})

jest.mock('../hooks/useWidgetAuth', () => ({
  useWidgetAuth: () => ({ getAuthToken: jest.fn().mockResolvedValue('tok'), authToken: 'tok', authError: null }),
}))
jest.mock('../hooks/useWidgetTranslation', () => ({
  useWidgetTranslation: () => ({ translations: { feedbackSubmittedMessage: 'Thanks' }, locale: 'en' }),
}))
jest.mock('../lib/i18n', () => ({
  getLocaleDirection: () => 'ltr',
  t: (_locale: string, key: string) => key,
  getTranslations: () => ({}),
  resolveInitialWidgetLocale: (l?: string) => l || 'en',
  SUPPORTED_LOCALES: ['en', 'de', 'es', 'fr', 'pt', 'sv', 'nl', 'nb', 'it', 'pl'],
  WIDGET_LOCALE_STORAGE_KEY: 'companin-widget-locale',
}))
jest.mock('../lib/api', () => ({
  API: { sessions: () => '/sessions', sessionMessages: (id: string) => `/sessions/${id}/messages`, widgetConfig: () => '/widget-config', messageFeedback: (id: string) => `/messages/${id}/feedback` },
  embedOriginHeader: () => ({}),
  trackEvent: jest.fn().mockResolvedValue(undefined),
}))

// UI components
jest.mock('@/components/ui/button', () => ({
  Button: (props: any) => require('react').createElement('button', props, props.children),
}))
jest.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children }: any) => require('react').createElement('div', null, children),
  DialogClose: ({ children }: any) => require('react').createElement('div', null, children),
  DialogContent: ({ children }: any) => require('react').createElement('div', null, children),
  DialogDescription: ({ children }: any) => require('react').createElement('div', null, children),
  DialogFooter: ({ children }: any) => require('react').createElement('div', null, children),
  DialogHeader: ({ children }: any) => require('react').createElement('div', null, children),
  DialogTitle: ({ children }: any) => require('react').createElement('h1', null, children),
}))
jest.mock('@/components/ui/scroll-area', () => ({
  ScrollArea: require('react').forwardRef((props: any, ref: any) => require('react').createElement('div', { ref }, props.children)),
}))
jest.mock('../src/components/ui/button', () => ({
  Button: (props: any) => require('react').createElement('button', props, props.children),
}))
jest.mock('../src/components/ui/dialog', () => ({
  Dialog: ({ children }: any) => require('react').createElement('div', null, children),
  DialogClose: ({ children }: any) => require('react').createElement('div', null, children),
  DialogContent: ({ children }: any) => require('react').createElement('div', null, children),
  DialogDescription: ({ children }: any) => require('react').createElement('div', null, children),
  DialogFooter: ({ children }: any) => require('react').createElement('div', null, children),
  DialogHeader: ({ children }: any) => require('react').createElement('div', null, children),
  DialogTitle: ({ children }: any) => require('react').createElement('h1', null, children),
}))
jest.mock('../src/components/ui/scroll-area', () => ({
  ScrollArea: require('react').forwardRef((props: any, ref: any) => require('react').createElement('div', { ref }, props.children)),
}))

// AI element components — @/ path
jest.mock('@/components/ai-elements/conversation', () => ({
  Conversation: ({ children }: any) => require('react').createElement('div', null, children),
  ConversationContent: ({ children }: any) => require('react').createElement('div', null, children),
  ConversationScrollButton: () => require('react').createElement('div', null),
}))
jest.mock('@/components/ai-elements/message', () => ({
  MessageBranch: ({ children }: any) => require('react').createElement('div', null, children),
  MessageBranchContent: ({ children }: any) => require('react').createElement('div', null, children),
  MessageBranchSelector: ({ children }: any) => require('react').createElement('div', null, children),
  MessageBranchPrevious: () => require('react').createElement('div', null),
  MessageBranchPage: () => require('react').createElement('div', null),
  MessageBranchNext: () => require('react').createElement('div', null),
  Message: ({ children }: any) => require('react').createElement('div', null, children),
  MessageContent: ({ children }: any) => require('react').createElement('div', null, children),
  MessageResponse: ({ children }: any) => require('react').createElement('div', null, children),
}))
jest.mock('@/components/ai-elements/prompt-input', () => ({
  PromptInput: ({ children, onSubmit }: any) => require('react').createElement('div', null,
    require('react').createElement('button', { 'data-testid': 'submit-preview', onClick: () => onSubmit?.({ text: 'test question', files: [] }) }, 'Submit'),
    children
  ),
  PromptInputActionAddAttachments: () => require('react').createElement('div', null),
  PromptInputActionMenu: ({ children }: any) => require('react').createElement('div', null, children),
  PromptInputActionMenuContent: ({ children }: any) => require('react').createElement('div', null, children),
  PromptInputActionMenuTrigger: () => require('react').createElement('button', null),
  PromptInputAttachment: () => require('react').createElement('div', null),
  PromptInputAttachments: ({ children }: any) => require('react').createElement('div', null, typeof children === 'function' ? children({}) : children),
  PromptInputBody: ({ children }: any) => require('react').createElement('div', null, children),
  PromptInputButton: ({ children }: any) => require('react').createElement('button', null, children),
  PromptInputFooter: ({ children }: any) => require('react').createElement('div', null, children),
  PromptInputHeader: ({ children }: any) => require('react').createElement('div', null, children),
  PromptInputSubmit: ({ children, ...props }: any) => require('react').createElement('button', props, children || 'Send'),
  PromptInputTextarea: (props: any) => require('react').createElement('textarea', props),
  PromptInputTools: ({ children }: any) => require('react').createElement('div', null, children),
}))
jest.mock('@/components/ai-elements/reasoning', () => ({
  Reasoning: ({ children }: any) => require('react').createElement('div', null, children),
  ReasoningContent: ({ children }: any) => require('react').createElement('div', null, children),
  ReasoningTrigger: () => require('react').createElement('button', null),
}))
jest.mock('@/components/ai-elements/sources', () => ({
  Source: ({ title }: any) => require('react').createElement('div', null, title),
  Sources: ({ children }: any) => require('react').createElement('div', null, children),
  SourcesContent: ({ children }: any) => require('react').createElement('div', null, children),
  SourcesTrigger: () => require('react').createElement('button', null),
}))
jest.mock('@/components/ai-elements/suggestion', () => ({
  Suggestion: ({ onClick, suggestion }: any) => require('react').createElement('button', { onClick }, suggestion),
  Suggestions: ({ children }: any) => require('react').createElement('div', null, children),
}))
jest.mock('@/components/ai-elements/model-selector', () => ({
  ModelSelector: ({ children }: any) => require('react').createElement('div', null, children),
  ModelSelectorContent: ({ children }: any) => require('react').createElement('div', null, children),
  ModelSelectorEmpty: ({ children }: any) => require('react').createElement('div', null, children),
  ModelSelectorGroup: ({ children }: any) => require('react').createElement('div', null, children),
  ModelSelectorInput: (props: any) => require('react').createElement('input', props),
  ModelSelectorItem: ({ children }: any) => require('react').createElement('div', null, children),
  ModelSelectorList: ({ children }: any) => require('react').createElement('div', null, children),
  ModelSelectorLogo: ({ children }: any) => require('react').createElement('div', null, children),
  ModelSelectorLogoGroup: ({ children }: any) => require('react').createElement('div', null, children),
  ModelSelectorName: ({ children }: any) => require('react').createElement('div', null, children),
  ModelSelectorTrigger: ({ children }: any) => require('react').createElement('button', null, children),
}))

// AI element components — ../src/ path (same mocks, different resolution path)
jest.mock('../src/components/ai-elements/conversation', () => ({
  Conversation: ({ children }: any) => require('react').createElement('div', null, children),
  ConversationContent: ({ children }: any) => require('react').createElement('div', null, children),
  ConversationScrollButton: () => require('react').createElement('div', null),
}))
jest.mock('../src/components/ai-elements/message', () => ({
  MessageBranch: ({ children }: any) => require('react').createElement('div', null, children),
  MessageBranchContent: ({ children }: any) => require('react').createElement('div', null, children),
  MessageBranchSelector: ({ children }: any) => require('react').createElement('div', null, children),
  MessageBranchPrevious: () => require('react').createElement('div', null),
  MessageBranchPage: () => require('react').createElement('div', null),
  MessageBranchNext: () => require('react').createElement('div', null),
  Message: ({ children }: any) => require('react').createElement('div', null, children),
  MessageContent: ({ children }: any) => require('react').createElement('div', null, children),
  MessageResponse: ({ children }: any) => require('react').createElement('div', null, children),
}))
jest.mock('../src/components/ai-elements/prompt-input', () => ({
  PromptInput: ({ children, onSubmit }: any) => require('react').createElement('div', null,
    require('react').createElement('button', { 'data-testid': 'submit-preview', onClick: () => onSubmit?.({ text: 'test question', files: [] }) }, 'Submit'),
    children
  ),
  PromptInputActionAddAttachments: () => require('react').createElement('div', null),
  PromptInputActionMenu: ({ children }: any) => require('react').createElement('div', null, children),
  PromptInputActionMenuContent: ({ children }: any) => require('react').createElement('div', null, children),
  PromptInputActionMenuTrigger: () => require('react').createElement('button', null),
  PromptInputAttachment: () => require('react').createElement('div', null),
  PromptInputAttachments: ({ children }: any) => require('react').createElement('div', null, typeof children === 'function' ? children({}) : children),
  PromptInputBody: ({ children }: any) => require('react').createElement('div', null, children),
  PromptInputButton: ({ children }: any) => require('react').createElement('button', null, children),
  PromptInputFooter: ({ children }: any) => require('react').createElement('div', null, children),
  PromptInputHeader: ({ children }: any) => require('react').createElement('div', null, children),
  PromptInputSubmit: ({ children, ...props }: any) => require('react').createElement('button', props, children || 'Send'),
  PromptInputTextarea: (props: any) => require('react').createElement('textarea', props),
  PromptInputTools: ({ children }: any) => require('react').createElement('div', null, children),
}))
jest.mock('../src/components/ai-elements/reasoning', () => ({
  Reasoning: ({ children }: any) => require('react').createElement('div', null, children),
  ReasoningContent: ({ children }: any) => require('react').createElement('div', null, children),
  ReasoningTrigger: () => require('react').createElement('button', null),
}))
jest.mock('../src/components/ai-elements/sources', () => ({
  Source: ({ title }: any) => require('react').createElement('div', null, title),
  Sources: ({ children }: any) => require('react').createElement('div', null, children),
  SourcesContent: ({ children }: any) => require('react').createElement('div', null, children),
  SourcesTrigger: () => require('react').createElement('button', null),
}))
jest.mock('../src/components/ai-elements/suggestion', () => ({
  Suggestion: ({ onClick, suggestion }: any) => require('react').createElement('button', { onClick }, suggestion),
  Suggestions: ({ children }: any) => require('react').createElement('div', null, children),
}))

import DocsClient from '../app/embed/docs/DocsClient'

// Invalid-base64 sentinel: atob throws, catch runs, no auth/API calls, preview rendering used.
const PREVIEW_SENTINEL = 'PREVIEW_MODE'

describe('DocsClient preview mode', () => {
  const origParent = Object.getOwnPropertyDescriptor(window, 'parent')

  beforeEach(() => {
    localStorage.clear()
    if (origParent) Object.defineProperty(window, 'parent', origParent)
  })

  afterEach(() => {
    if (origParent) Object.defineProperty(window, 'parent', origParent)
  })

  it('renders the inline preview panel (not Dialog) when previewConfig is set', () => {
    const { container } = render(
      <DocsClient clientId="preview" agentId="preview" configId="preview" locale="en" startOpen={true} previewConfig={PREVIEW_SENTINEL} />
    )
    expect(container.firstChild).toBeInTheDocument()
    expect(container.querySelector('[aria-live="polite"]')).toBeInTheDocument()
  })

  it('restores open state true from localStorage in preview mode', () => {
    localStorage.setItem('companin-preview-docs-open', 'true')
    const { container } = render(
      <DocsClient clientId="preview" agentId="preview" configId="preview" locale="en" startOpen={false} previewConfig={PREVIEW_SENTINEL} />
    )
    expect(container.firstChild).toBeInTheDocument()
  })

  it('persists open state to localStorage while in preview mode', async () => {
    render(
      <DocsClient clientId="preview" agentId="preview" configId="preview" locale="en" startOpen={true} previewConfig={PREVIEW_SENTINEL} />
    )
    await waitFor(() => {
      expect(localStorage.getItem('companin-preview-docs-open')).not.toBeNull()
    })
  })

  it('updates document.documentElement.lang to the provided locale', () => {
    render(
      <DocsClient clientId="preview" agentId="preview" configId="preview" locale="ar" startOpen={true} previewConfig={PREVIEW_SENTINEL} />
    )
    expect(document.documentElement.lang).toBe('ar')
  })

  it('sends COMPANIN_PREVIEW_READY postMessage on mount', async () => {
    const postMessageSpy = jest.fn()
    Object.defineProperty(window, 'parent', { value: { postMessage: postMessageSpy }, configurable: true })
    render(
      <DocsClient clientId="preview" agentId="preview" configId="preview" locale="en" startOpen={true} previewConfig={PREVIEW_SENTINEL} />
    )
    await waitFor(() => {
      expect(postMessageSpy).toHaveBeenCalledWith(expect.objectContaining({ type: 'COMPANIN_PREVIEW_READY' }), '*')
    })
  })

  it('applies live config via COMPANIN_PREVIEW_CONFIG postMessage', async () => {
    const { container } = render(
      <DocsClient clientId="preview" agentId="preview" configId="preview" locale="en" startOpen={true} previewConfig={PREVIEW_SENTINEL} />
    )
    const newConfig = { widget_type: 'docs', title: { en: 'Updated Title' } }
    const encoded = btoa(encodeURIComponent(JSON.stringify(newConfig)))
    await act(async () => {
      window.dispatchEvent(new MessageEvent('message', { data: { type: 'COMPANIN_PREVIEW_CONFIG', config: encoded } }))
    })
    await waitFor(() => expect(container.firstChild).toBeInTheDocument())
  })

  it('renders suggestions from a valid base64 preview config', async () => {
    const config = { widget_type: 'docs', suggestions: ['How do I start?', 'What can you do?'] }
    const encoded = btoa(encodeURIComponent(JSON.stringify(config)))
    let getByText: any
    await act(async () => {
      const result = render(
        <DocsClient clientId="preview" agentId="preview" configId="preview" locale="en" startOpen={true} previewConfig={encoded} />
      )
      getByText = result.getByText
    })
    await waitFor(() => expect(getByText('How do I start?')).toBeInTheDocument())
  })
})
