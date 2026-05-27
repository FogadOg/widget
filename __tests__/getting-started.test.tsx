import React from 'react'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'

// Mock next/link
jest.mock('next/link', () => {
  const Link = ({ href, children, ...props }: { href: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  )
  Link.displayName = 'Link'
  return Link
})

// Mock next/headers used by the page's async server component
jest.mock('next/headers', () => ({
  headers: jest.fn(() => Promise.resolve({ get: jest.fn().mockReturnValue(null) })),
}));

// Mock shiki so HighlightedCode falls back to plain text in tests
jest.mock('shiki', () => ({
  codeToHtml: jest.fn().mockRejectedValue(new Error('shiki not available in tests')),
}))

// Mock embedManifest so tests don't depend on a manifest file on disk
jest.mock('../lib/embedManifest', () => ({
  getEmbedSrc: jest.fn().mockImplementation((key: string) => ({
    src: `https://widget.companin.tech/${key === 'docs-widget' ? 'docs-widget' : 'widget'}.js`,
    integrityAttr: '',
  })),
}))

// Mock clipboard API
Object.defineProperty(navigator, 'clipboard', {
  configurable: true,
  value: { writeText: jest.fn().mockResolvedValue(undefined) },
})

import FrameworkTabs from '../app/docs/getting-started/FrameworkTabs'
import GettingStartedPage from '../app/docs/getting-started/page'
import { getEmbedSrc } from '../lib/embedManifest'

// ─── FrameworkTabs ───────────────────────────────────────────────────────────

describe('FrameworkTabs', () => {
  it('renders all framework tabs', () => {
    render(<FrameworkTabs />)
    expect(screen.getByText('HTML / JS')).toBeInTheDocument()
    expect(screen.getByText('Next.js')).toBeInTheDocument()
    expect(screen.getByText('React')).toBeInTheDocument()
    expect(screen.getByText('Angular')).toBeInTheDocument()
    expect(screen.getByText('Vue')).toBeInTheDocument()
  })

  it('shows HTML / JS snippet by default', () => {
    render(<FrameworkTabs />)
    expect(screen.getByText(/YOUR_CONFIG_ID/)).toBeInTheDocument()
    expect(screen.getByText(/widget\.companin\.tech\/widget\.js/)).toBeInTheDocument()
  })

  it('switches to Next.js snippet when tab is clicked', () => {
    render(<FrameworkTabs />)
    fireEvent.click(screen.getByText('Next.js'))
    expect(screen.getByText(/app\/layout\.tsx/)).toBeInTheDocument()
  })

  it('switches to React snippet when tab is clicked', () => {
    render(<FrameworkTabs />)
    fireEvent.click(screen.getByText('React'))
    expect(screen.getByText(/src\/App\.tsx/)).toBeInTheDocument()
  })

  it('switches to Angular snippet when tab is clicked', () => {
    render(<FrameworkTabs />)
    fireEvent.click(screen.getByText('Angular'))
    expect(screen.getByText(/app\.component\.ts/)).toBeInTheDocument()
  })

  it('switches to Vue snippet when tab is clicked', () => {
    render(<FrameworkTabs />)
    fireEvent.click(screen.getByText('Vue'))
    expect(screen.getByText(/src\/App\.vue/)).toBeInTheDocument()
  })

  it('renders a Copy button', () => {
    render(<FrameworkTabs />)
    expect(screen.getByRole('button', { name: /copy code snippet/i })).toBeInTheDocument()
  })

  it('copies snippet to clipboard and shows Copied! feedback', async () => {
    render(<FrameworkTabs />)
    const copyBtn = screen.getByRole('button', { name: /copy code snippet/i })
    await act(async () => { fireEvent.click(copyBtn) })
    expect(navigator.clipboard.writeText).toHaveBeenCalled()
    expect(await screen.findByText('Copied!')).toBeInTheDocument()
  })

  it('resets Copy button label back after timeout', async () => {
    jest.useFakeTimers()
    render(<FrameworkTabs />)
    const copyBtn = screen.getByRole('button', { name: /copy code snippet/i })
    await act(async () => { fireEvent.click(copyBtn) })
    expect(screen.getByText('Copied!')).toBeInTheDocument()
    act(() => { jest.advanceTimersByTime(2100) })
    expect(screen.getByText('Copy')).toBeInTheDocument()
    jest.useRealTimers()
  })

  it('HTML snippet includes ChatWidgetConfig fields', () => {
    render(<FrameworkTabs />)
    const pre = screen.getByText(/YOUR_CONFIG_ID/).closest('pre')
    expect(pre?.textContent).toContain('primaryColor')
    expect(pre?.textContent).toContain('greetingMessage')
    expect(pre?.textContent).toContain('position')
  })
})

// ─── GettingStartedPage ───────────────────────────────────────────────────────

describe('GettingStartedPage', () => {
  it('renders the page heading', async () => {
    const jsx = await (GettingStartedPage as any)()
    render(jsx)
    expect(screen.getByRole('heading', { name: /getting started/i, level: 1 })).toBeInTheDocument()
  })

  it('renders the back link', async () => {
    const jsx = await (GettingStartedPage as any)()
    render(jsx)
    const link = screen.getByRole('link', { name: /back/i })
    expect(link).toHaveAttribute('href', '/en')
  })

  it('renders all three step headings', async () => {
    const jsx = await (GettingStartedPage as any)()
    render(jsx)
    expect(screen.getByRole('heading', { name: /get your credentials/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /add the snippet/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /done/i })).toBeInTheDocument()
  })

  it('renders the prerequisites section', async () => {
    const jsx = await (GettingStartedPage as any)()
    render(jsx)
    expect(screen.getByRole('heading', { name: /prerequisites/i })).toBeInTheDocument()
    expect(screen.getAllByText(/Client ID/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Assistant ID/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Config ID/).length).toBeGreaterThan(0)
  })

  it('renders the FrameworkTabs component', async () => {
    const jsx = await (GettingStartedPage as any)()
    render(jsx)
    expect(screen.getAllByText('HTML / JS').length).toBeGreaterThan(0)
  })

  it('renders step numbers 1, 2, 3', async () => {
    const jsx = await (GettingStartedPage as any)()
    render(jsx)
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
  })

  it('mentions YOUR_CONFIG_ID placeholder in snippet instructions', async () => {
    const jsx = await (GettingStartedPage as any)()
    render(jsx)
    expect(screen.getAllByText(/YOUR_CONFIG_ID/).length).toBeGreaterThan(0)
  })
})

describe('GettingStartedPage – docsIntegrityAttr truthy branch', () => {
  afterEach(() => {
    (getEmbedSrc as jest.Mock).mockImplementation((key: string) => ({
      src: `https://widget.companin.tech/${key === 'docs-widget' ? 'docs-widget' : 'widget'}.js`,
      integrityAttr: '',
    }));
  });

  it('includes integrity attr in the docs-widget HTML snippet when docsIntegrityAttr is set', async () => {
    (getEmbedSrc as jest.Mock).mockImplementation((key: string) => {
      if (key === 'docs-widget') {
        return { src: 'https://widget.companin.tech/docs-widget-1.0.0.js', integrityAttr: 'integrity="sha384-testHash" crossorigin="anonymous"' };
      }
      return { src: 'https://widget.companin.tech/widget.js', integrityAttr: '' };
    });

    const jsx = await (GettingStartedPage as any)();
    render(jsx);
    expect(document.body.textContent).toContain('sha384-testHash');
  });
})
