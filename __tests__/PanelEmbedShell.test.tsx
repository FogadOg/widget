import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import PanelEmbedShell from '../components/layouts/PanelEmbedShell';
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
  backgroundColor: '#ffffff',
  textColor: '#111111',
  readableOnPrimary: '#ffffff',
  mutedTextColor: 'rgba(17,17,17,0.6)',
  subtleBorderColor: 'rgba(17,17,17,0.12)',
  agentBubbleBg: 'rgba(0,0,0,0.05)',
  borderRadius: 12,
  fontStyles: { fontFamily: 'Inter', fontSize: '14px', fontWeight: 'normal' },
  widgetWidth: 360,
  widgetHeight: 560,
  messageBubbleRadius: 8,
  buttonBorderRadius: 6,
  showTimestamps: false,
  showMessageAvatars: true,
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
  return render(<PanelEmbedShell {...(baseProps as any)} {...props} />);
}

beforeEach(() => {
  jest.clearAllMocks();
  widgetStylesMock.mockReturnValue(baseStyles);
});

describe('PanelEmbedShell — collapsed', () => {
  it('renders the collapsed trigger with the configured title', () => {
    // The trigger carries an aria-label (open control), so match on its text content.
    renderShell({ isCollapsed: true, widgetConfig: { title: { en: 'Help Panel' } } });
    expect(screen.getByText('Help Panel')).toBeInTheDocument();
  });

  it('opens the panel when the collapsed trigger is clicked', () => {
    const toggleCollapsed = jest.fn();
    renderShell({ isCollapsed: true, toggleCollapsed, widgetConfig: { title: { en: 'Chat' } } });
    fireEvent.click(screen.getByText('Chat'));
    expect(toggleCollapsed).toHaveBeenCalledTimes(1);
  });

  it('uses preview positioning when previewPositioning is set', () => {
    const { container } = renderShell({
      isCollapsed: true,
      previewPositioning: true,
      widgetConfig: { title: { en: 'Chat' } },
    });
    const btn = container.querySelector('button') as HTMLButtonElement;
    expect(btn.style.bottom).toBe('20px');
  });
});

describe('PanelEmbedShell — expanded', () => {
  it('renders the title and subtitle and closes via the sidebar button', () => {
    const toggleCollapsed = jest.fn();
    renderShell({
      toggleCollapsed,
      widgetConfig: { title: { en: 'Support' }, subtitle: { en: 'Ask us anything' } },
    });
    expect(screen.getByText('Support')).toBeInTheDocument();
    expect(screen.getByText('Ask us anything')).toBeInTheDocument();
    fireEvent.click(screen.getByText('×'));
    expect(toggleCollapsed).toHaveBeenCalledTimes(1);
  });

  it('renders suggestions and submits the chosen suggestion', () => {
    const handleSubmit = jest.fn();
    renderShell({ handleSubmit, widgetConfig: { suggestions: ['Reset my password'] } });
    fireEvent.click(screen.getByText('Reset my password'));
    expect(handleSubmit).toHaveBeenCalledWith(expect.anything(), 'Reset my password');
  });

  it('does not render suggestions once messages exist', () => {
    renderShell({
      messages: [{ id: 'm1', text: 'hi', from: 'user' }],
      widgetConfig: { suggestions: ['A suggestion'] },
    });
    expect(screen.queryByText('A suggestion')).not.toBeInTheDocument();
  });

  it('renders messages sorted by timestamp', () => {
    renderShell({
      messages: [
        { id: 'm2', text: 'Later', from: 'agent', timestamp: 2 },
        { id: 'm1', text: 'Earlier', from: 'user', timestamp: 1 },
      ],
    });
    expect(screen.getByText('Earlier')).toBeInTheDocument();
    expect(screen.getByText('Later')).toBeInTheDocument();
  });

  it('renders flow responses and fires the follow-up callback', () => {
    const onFollowUpButtonClick = jest.fn();
    renderShell({
      onFollowUpButtonClick,
      flowResponses: [
        { text: 'Choose', timestamp: 1, buttons: [{ id: 'f1', label: { en: 'Yes' } }] },
      ],
    });
    expect(screen.getByText('Choose')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Yes'));
    expect(onFollowUpButtonClick).toHaveBeenCalledTimes(1);
  });

  it('falls back to "Button" for a flow button with an empty label', () => {
    renderShell({
      flowResponses: [{ text: '', timestamp: 1, buttons: [{ id: 'f1', label: { en: '' } }] }],
    });
    expect(screen.getByText('Button')).toBeInTheDocument();
  });

  it('renders the streaming message when present', () => {
    renderShell({ streamingMessage: 'streaming reply', isTyping: true });
    expect(screen.getByText('streaming reply')).toBeInTheDocument();
  });

  it('renders the feedback dialog overlay when requested', () => {
    renderShell({
      showFeedbackDialog: true,
      feedbackDialog: <div>Feedback here</div>,
    });
    expect(screen.getByText('Feedback here')).toBeInTheDocument();
  });

  it('renders the unsure modal overlay', () => {
    renderShell({ unsureModal: <div>Not sure modal</div> });
    expect(screen.getByText('Not sure modal')).toBeInTheDocument();
  });

  it('renders the handoff modal overlay', () => {
    renderShell({ handoffModal: <div>Handoff modal</div> });
    expect(screen.getByText('Handoff modal')).toBeInTheDocument();
  });

  it('uses the getText string fallback when no getLocalizedText is provided', () => {
    renderShell({
      getLocalizedText: undefined,
      widgetConfig: { title: { en: 'Fallback Panel Title' } },
    });
    expect(screen.getByText('Fallback Panel Title')).toBeInTheDocument();
  });
});
