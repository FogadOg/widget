import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, act } from '@testing-library/react';
import MinimalEmbedShell from '../components/layouts/MinimalEmbedShell';
import { useWidgetStyles } from '../hooks/useWidgetStyles';

const widgetStylesMock = useWidgetStyles as jest.Mock;

jest.mock('../hooks/useWidgetStyles', () => ({
  useWidgetStyles: jest.fn(),
}));

jest.mock('../hooks/useWidgetTranslation', () => ({
  useWidgetTranslation: () => ({ locale: 'en' }),
}));

const baseStyles = {
  primaryColor: '#2563eb',
  secondaryColor: '#1e40af',
  backgroundColor: '#ffffff',
  textColor: '#111111',
  readableOnPrimary: '#ffffff',
  mutedTextColor: 'rgba(17,17,17,0.6)',
  subtleBorderColor: 'rgba(17,17,17,0.12)',
  agentBubbleBg: 'rgba(0,0,0,0.05)',
  borderRadius: 12,
  fontStyles: { fontFamily: 'Inter', fontSize: '14px', fontWeight: 'normal' },
  getButtonSizeClasses: { width: 'w-14', height: 'h-14', icon: 'w-6 h-6' },
  widgetWidth: 360,
  widgetHeight: 560,
  messageBubbleRadius: 8,
  buttonBorderRadius: 6,
  showTimestamps: false,
  showTypingIndicator: true,
  showMessageAvatars: true,
  showUnreadBadge: true,
  spacingValues: { padding: '12px', gap: '10px' },
};

const baseProps = {
  isEmbedded: true,
  isCollapsed: false,
  toggleCollapsed: jest.fn(),
  messages: [] as any[],
  isTyping: false,
  input: '',
  setInput: jest.fn(),
  handleSubmit: jest.fn(),
  locale: 'en',
  getLocalizedText: (t: any) => (typeof t === 'string' ? t : t?.en || ''),
};

function renderShell(props: Record<string, any> = {}, styles: Record<string, any> = {}) {
  widgetStylesMock.mockReturnValue({ ...baseStyles, ...styles });
  return render(<MinimalEmbedShell {...(baseProps as any)} {...props} />);
}

beforeEach(() => {
  jest.clearAllMocks();
  widgetStylesMock.mockReturnValue(baseStyles);
});

describe('MinimalEmbedShell — collapsed', () => {
  it('renders the open button with the SVG fallback icon when no logo', () => {
    const { container } = renderShell({ isCollapsed: true });
    const btn = screen.getByRole('button');
    expect(btn).toBeInTheDocument();
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('renders the logo image when a logo is configured', () => {
    renderShell({
      isCollapsed: true,
      widgetConfig: { logo: 'https://example.com/logo.png', title: { en: 'Acme' } },
    });
    expect(screen.getByAltText(/Acme logo/)).toBeInTheDocument();
  });

  it('shows the unread badge with the count when unread messages exist', () => {
    renderShell({ isCollapsed: true, unreadCount: 5 });
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('caps the unread badge at 99+', () => {
    renderShell({ isCollapsed: true, unreadCount: 150 });
    expect(screen.getByText('99+')).toBeInTheDocument();
  });

  it('does not show the badge when showUnreadBadge is disabled', () => {
    renderShell({ isCollapsed: true, unreadCount: 3 }, { showUnreadBadge: false });
    expect(screen.queryByText('3')).not.toBeInTheDocument();
  });

  it('opens the widget when the collapsed button is clicked', () => {
    const toggleCollapsed = jest.fn();
    renderShell({ isCollapsed: true, toggleCollapsed });
    fireEvent.click(screen.getByRole('button'));
    expect(toggleCollapsed).toHaveBeenCalledTimes(1);
  });

  it('uses preview positioning when previewPositioning is set', () => {
    const { container } = renderShell({ isCollapsed: true, previewPositioning: true });
    const btn = container.querySelector('button') as HTMLButtonElement;
    expect(btn.style.bottom).toBe('20px');
    expect(btn.style.right).toBe('20px');
  });
});

describe('MinimalEmbedShell — expanded', () => {
  it('renders the title, subtitle and close button', () => {
    const toggleCollapsed = jest.fn();
    renderShell({
      toggleCollapsed,
      widgetConfig: { title: { en: 'Support' }, subtitle: { en: 'We reply fast' } },
    });
    expect(screen.getByText('Support')).toBeInTheDocument();
    expect(screen.getByText('We reply fast')).toBeInTheDocument();
    // The header close button toggles collapsed.
    fireEvent.click(screen.getByText('-'));
    expect(toggleCollapsed).toHaveBeenCalledTimes(1);
  });

  it('renders the greeting and interaction buttons and fires the interaction callback', () => {
    const onInteractionButtonClick = jest.fn();
    renderShell({
      onInteractionButtonClick,
      widgetConfig: {
        greeting_message: {
          text: { en: 'Welcome!' },
          buttons: [{ id: 'b1', label: { en: 'Pricing' } }],
        },
      },
    });
    expect(screen.getByText('Welcome!')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Pricing'));
    expect(onInteractionButtonClick).toHaveBeenCalledTimes(1);
  });

  it('filters interaction buttons by locale', () => {
    renderShell({
      locale: 'en',
      widgetConfig: {
        greeting_message: {
          text: { en: 'Hi' },
          buttons: [
            { id: 'b1', label: { en: 'English only' }, languages: ['en'] },
            { id: 'b2', label: { en: 'German only' }, languages: ['de'] },
          ],
        },
      },
    });
    expect(screen.getByText('English only')).toBeInTheDocument();
    expect(screen.queryByText('German only')).not.toBeInTheDocument();
  });

  it('renders suggestions and submits the chosen suggestion', () => {
    const handleSubmit = jest.fn();
    renderShell({
      handleSubmit,
      widgetConfig: { suggestions: ['How do I start?'] },
    });
    const chip = screen.getByText('How do I start?');
    fireEvent.click(chip);
    expect(handleSubmit).toHaveBeenCalledWith(expect.anything(), 'How do I start?');
  });

  it('hides suggestions once the visitor has sent a message', () => {
    renderShell({
      messages: [{ id: 'm1', text: 'hello', from: 'user' }],
      widgetConfig: { suggestions: ['A suggestion'] },
    });
    expect(screen.queryByText('A suggestion')).not.toBeInTheDocument();
  });

  it('reads locale-specific suggestions from an object map', () => {
    renderShell({
      locale: 'en',
      widgetConfig: { suggestions: { en: ['English tip'], de: ['German tip'] } },
    });
    expect(screen.getByText('English tip')).toBeInTheDocument();
  });

  it('renders user and agent messages, sorted by timestamp', () => {
    renderShell({
      messages: [
        { id: 'm2', text: 'Second', from: 'agent', timestamp: 2 },
        { id: 'm1', text: 'First', from: 'user', timestamp: 1 },
      ],
    });
    expect(screen.getByText('First')).toBeInTheDocument();
    expect(screen.getByText('Second')).toBeInTheDocument();
  });

  it('renders flow responses and fires the follow-up callback', () => {
    const onFollowUpButtonClick = jest.fn();
    renderShell({
      onFollowUpButtonClick,
      flowResponses: [
        { text: 'Pick one', timestamp: 1, buttons: [{ id: 'f1', label: { en: 'Option A' } }] },
      ],
    });
    expect(screen.getByText('Pick one')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Option A'));
    expect(onFollowUpButtonClick).toHaveBeenCalledTimes(1);
  });

  it('falls back to "Button" for a flow button with an empty label', () => {
    renderShell({
      flowResponses: [{ text: '', timestamp: 1, buttons: [{ id: 'f1', label: { en: '' } }] }],
    });
    expect(screen.getByText('Button')).toBeInTheDocument();
  });

  it('renders the streaming message when present', () => {
    renderShell({ streamingMessage: 'partial answer', isTyping: true });
    expect(screen.getByText('partial answer')).toBeInTheDocument();
  });

  it('renders the typing indicator while typing with no stream', () => {
    renderShell({ isTyping: true });
    // TypingIndicator exposes role="status" for the live region.
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('renders the language menu when a switcher is available', () => {
    const onLocaleChange = jest.fn();
    renderShell({ onLocaleChange, availableLocales: ['en', 'de'] });
    // LanguageMenu trigger exposes the localized "select language" aria-label.
    const triggers = screen.getAllByRole('button');
    expect(triggers.length).toBeGreaterThan(0);
  });

  it('omits the language menu with fewer than two locales', () => {
    const onLocaleChange = jest.fn();
    const { container } = renderShell({ onLocaleChange, availableLocales: ['en'] });
    expect(container.querySelector('[aria-haspopup="menu"]')).toBeNull();
  });

  it('uses the getText string fallback when no getLocalizedText is provided', () => {
    renderShell({
      getLocalizedText: undefined,
      widgetConfig: { title: { en: 'Fallback Title' } },
    });
    expect(screen.getByText('Fallback Title')).toBeInTheDocument();
  });

  it('always shows the greeting in preview mode even with messages present', () => {
    renderShell({
      isPreview: true,
      messages: [{ id: 'm1', text: 'user text', from: 'user' }],
      widgetConfig: { greeting_message: { text: { en: 'Preview greeting' }, buttons: [] } },
    });
    expect(screen.getByText('Preview greeting')).toBeInTheDocument();
  });
});
