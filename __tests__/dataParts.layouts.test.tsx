import React from 'react';
import '@testing-library/jest-dom';
import { render } from '@testing-library/react';
import EmbedShell from '../components/EmbedShell';
import { useWidgetStyles } from '../hooks/useWidgetStyles';

/**
 * `data-part` attributes are the public styling contract for custom CSS: the
 * docs (Advanced → Custom styling) tell customers to target them, and the
 * widget otherwise has only Tailwind utility classes that change freely.
 * Removing or renaming one silently breaks paying customers' stylesheets, and
 * every layout must expose the same names or switching layout_variant does it.
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
  // Read by the classic layout's panel background.
  visualEffectStyles: {},
  backgroundOpacity: 1,
};

const messages = [
  { id: 'u1', text: 'Hello', from: 'user', timestamp: 1 },
  { id: 'a1', text: 'Hi there', from: 'agent', timestamp: 2 },
];

function renderShell(layoutVariant: string, opts: { isCollapsed?: boolean; isEmbedded?: boolean } = {}) {
  widgetStylesMock.mockReturnValue(baseStyles);
  return render(
    <EmbedShell
      {...({
        isEmbedded: opts.isEmbedded ?? true,
        isCollapsed: opts.isCollapsed ?? false,
        toggleCollapsed: jest.fn(),
        messages,
        isTyping: false,
        input: '',
        setInput: jest.fn(),
        handleSubmit: jest.fn(),
        locale: 'en',
        getLocalizedText: (t: any) => (typeof t === 'string' ? t : t?.en || ''),
      } as any)}
      widgetConfig={{ layout_variant: layoutVariant } as any}
    />,
  );
}

const part = (container: HTMLElement, name: string) =>
  container.querySelectorAll(`[data-part="${name}"]`);

const OPEN_PARTS = [
  'panel',
  'header',
  'title',
  'close-button',
  'messages',
  'composer',
  'composer-input',
  'send-button',
  'powered-by',
];

describe.each([
  ['classic (embedded)', 'classic', true],
  ['classic (floating)', 'classic', false],
  ['minimal', 'minimal', true],
  ['panel', 'panel', true],
])('%s layout exposes the documented data-part hooks', (_label, variant, isEmbedded) => {
  test.each(OPEN_PARTS)('open panel has exactly one [data-part="%s"]', (name) => {
    const { container } = renderShell(variant as string, { isEmbedded: isEmbedded as boolean });
    expect(part(container, name)).toHaveLength(1);
  });

  test('messages carry data-part="message" with data-from and a message-bubble', () => {
    const { container } = renderShell(variant as string, { isEmbedded: isEmbedded as boolean });
    expect(container.querySelector('[data-part="message"][data-from="user"] [data-part="message-bubble"]')).toBeInTheDocument();
    expect(container.querySelector('[data-part="message"][data-from="agent"] [data-part="message-bubble"]')).toBeInTheDocument();
  });

  test('collapsed state shows the launcher', () => {
    const { container } = renderShell(variant as string, { isEmbedded: isEmbedded as boolean, isCollapsed: true });
    expect(part(container, 'launcher')).toHaveLength(1);
  });
});
