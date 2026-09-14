import React from 'react';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import EmbedShell from '../components/EmbedShell';
import { useWidgetStyles } from '../hooks/useWidgetStyles';

/**
 * Regression guard for the free-tier growth loop.
 *
 * The "Powered by" badge used to live inline in FloatingView/EmbeddedView only,
 * so the `minimal` and `panel` layouts shipped without it. `layout_variant` is
 * not plan-gated, which made picking either layout a free way out of the badge.
 *
 * These tests go through the EmbedShell dispatcher rather than the shells
 * directly, so they also pin the variant -> shell mapping.
 */

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

function renderVariant(layoutVariant: string, widgetConfig: Record<string, any> = {}) {
  widgetStylesMock.mockReturnValue(baseStyles);
  return render(
    <EmbedShell
      {...(baseProps as any)}
      widgetConfig={{ layout_variant: layoutVariant, ...widgetConfig } as any}
    />,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  widgetStylesMock.mockReturnValue(baseStyles);
});

// `classic` is covered by EmbeddedView.test.tsx, which renders the view directly
// with a full view-model; the dispatcher cases below are the ones that regressed.
describe.each(['minimal', 'panel'])('%s layout — powered-by badge', (variant) => {
  it('renders the badge when hide_branding is unset (the free-plan default)', () => {
    renderVariant(variant);
    expect(screen.getByText(/Powered by/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /companin/i })).toHaveAttribute(
      'href',
      'https://companin.tech',
    );
  });

  it('renders the badge when hide_branding is explicitly false', () => {
    renderVariant(variant, { hide_branding: false });
    expect(screen.getByText(/Powered by/i)).toBeInTheDocument();
  });

  it('hides the badge when the plan allows hide_branding', () => {
    renderVariant(variant, { hide_branding: true });
    expect(screen.queryByText(/Powered by/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /companin/i })).not.toBeInTheDocument();
  });

  it('shows the EU/GDPR hosting note alongside the badge', () => {
    renderVariant(variant);
    expect(screen.getAllByText(/Hosted in the EU/i).length).toBeGreaterThan(0);
  });
});
