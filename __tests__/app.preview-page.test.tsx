import React from 'react'
import { render } from '@testing-library/react'
import '@testing-library/jest-dom'

// Mock heavy client components so the async server component renders cheaply
jest.mock('../app/embed/session/EmbedClient', () => ({
  __esModule: true,
  default: ({ previewConfig, locale }: any) =>
    React.createElement('div', { 'data-testid': 'embed-client', 'data-locale': locale, 'data-preview': previewConfig }, 'EmbedClient'),
}))

jest.mock('../app/embed/docs/DocsClient', () => ({
  __esModule: true,
  default: ({ previewConfig, locale }: any) =>
    React.createElement('div', { 'data-testid': 'docs-client', 'data-locale': locale, 'data-preview': previewConfig }, 'DocsClient'),
}))

jest.mock('../components/ErrorBoundary', () => ({
  __esModule: true,
  default: ({ children }: any) => React.createElement('div', { 'data-testid': 'error-boundary' }, children),
}))

import PreviewPage from '../app/preview/page'

describe('app/preview/page', () => {
  it('renders EmbedClient when type is absent', async () => {
    const element = await PreviewPage({ searchParams: Promise.resolve({}) })
    const { getByTestId } = render(element as React.ReactElement)
    expect(getByTestId('embed-client')).toBeInTheDocument()
  })

  it('renders EmbedClient when type is chat', async () => {
    const element = await PreviewPage({ searchParams: Promise.resolve({ type: 'chat' }) })
    const { getByTestId } = render(element as React.ReactElement)
    expect(getByTestId('embed-client')).toBeInTheDocument()
  })

  it('renders DocsClient when type is docs', async () => {
    const element = await PreviewPage({ searchParams: Promise.resolve({ type: 'docs' }) })
    const { getByTestId } = render(element as React.ReactElement)
    expect(getByTestId('docs-client')).toBeInTheDocument()
  })

  it('defaults locale to en when not provided', async () => {
    const element = await PreviewPage({ searchParams: Promise.resolve({}) })
    const { getByTestId } = render(element as React.ReactElement)
    expect(getByTestId('embed-client')).toHaveAttribute('data-locale', 'en')
  })

  it('uses the provided locale', async () => {
    const element = await PreviewPage({ searchParams: Promise.resolve({ locale: 'fr' }) })
    const { getByTestId } = render(element as React.ReactElement)
    expect(getByTestId('embed-client')).toHaveAttribute('data-locale', 'fr')
  })

  it('passes PREVIEW_MODE sentinel as previewConfig to EmbedClient', async () => {
    const element = await PreviewPage({ searchParams: Promise.resolve({}) })
    const { getByTestId } = render(element as React.ReactElement)
    expect(getByTestId('embed-client')).toHaveAttribute('data-preview', 'PREVIEW_MODE')
  })

  it('passes PREVIEW_MODE sentinel as previewConfig to DocsClient', async () => {
    const element = await PreviewPage({ searchParams: Promise.resolve({ type: 'docs', locale: 'es' }) })
    const { getByTestId } = render(element as React.ReactElement)
    expect(getByTestId('docs-client')).toHaveAttribute('data-preview', 'PREVIEW_MODE')
    expect(getByTestId('docs-client')).toHaveAttribute('data-locale', 'es')
  })

  it('wraps children in ErrorBoundary', async () => {
    const element = await PreviewPage({ searchParams: Promise.resolve({}) })
    const { getByTestId } = render(element as React.ReactElement)
    expect(getByTestId('error-boundary')).toBeInTheDocument()
  })
})
