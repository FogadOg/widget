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
  it('renders the title and subtitle and minimizes via the sidebar button', () => {
    const toggleCollapsed = jest.fn();
    renderShell({
      toggleCollapsed,
      widgetConfig: { title: { en: 'Support' }, subtitle: { en: 'Ask us anything' } },
    });
    expect(screen.getByText('Support')).toBeInTheDocument();
    expect(screen.getByText('Ask us anything')).toBeInTheDocument();
    // The control collapses the panel, so it's labelled "minimize" — it used to
    // be a "×" glyph whose aria-label claimed it closed the chat.
    fireEvent.click(screen.getByRole('button', { name: 'Minimize chat' }));
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

  it('omits a flow button with an empty label rather than labelling it "Button"', () => {
    renderShell({
      flowResponses: [{ text: '', timestamp: 1, buttons: [{ id: 'f1', label: { en: '' } }] }],
    });
    // Rendering the literal English word "Button" leaked untranslated copy into
    // every locale; an unlabelled control is not worth showing at all.
    expect(screen.queryByText('Button')).not.toBeInTheDocument();
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

// This layout used to render neither the configured greeting nor its
// interaction buttons, so a merchant who picked it lost the whole greeting
// flow (AI-answered buttons included) and visitors saw the generic prompt.
describe('PanelEmbedShell — greeting', () => {
  const widgetConfig = {
    greeting_message: {
      text: { en: 'Hello! Need help?' },
      buttons: [
        { id: 'b1', button_id: 'ai_pricing', action: 'text', answer_mode: 'ai', label: { en: 'Pricing' } },
        { id: 'b2', button_id: 'start', action: 'text', label: { en: 'Getting started' } },
      ],
    },
  };

  it('pins the greeting and its buttons instead of the empty-state prompt', () => {
    renderShell({ widgetConfig });
    expect(screen.getByText('Hello! Need help?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pricing' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Getting started' })).toBeInTheDocument();
  });

  it('routes a button click to onInteractionButtonClick', () => {
    const onInteractionButtonClick = jest.fn();
    renderShell({ widgetConfig, onInteractionButtonClick });
    fireEvent.click(screen.getByRole('button', { name: 'Pricing' }));
    expect(onInteractionButtonClick).toHaveBeenCalledWith(expect.objectContaining({ button_id: 'ai_pricing' }));
  });

  it('drops the server is_greeting copy so the greeting never doubles', () => {
    renderShell({
      widgetConfig,
      messages: [{ id: 'srv-g', text: 'Hello! Need help?', from: 'agent', timestamp: 1, metadata: { is_greeting: true } }],
    });
    expect(screen.getAllByText('Hello! Need help?')).toHaveLength(1);
  });

  it('caps the content column so wide content cannot blow it out', () => {
    const { container } = renderShell({ widgetConfig });
    const grid = Array.from(container.querySelectorAll<HTMLElement>('div')).find((d) => d.style.gridTemplateColumns);
    expect(grid?.style.gridTemplateColumns).toBe('44px minmax(0, 1fr)');
  });
});

// This layout used to render no teaser at all while the controller still grew
// the iframe for one — an invisible box over the host page that swallowed clicks
// and never showed the merchant's message.
describe('teaser bubble (collapsed)', () => {
  const teaser = { isCollapsed: true, teaserConfigured: true, teaserExpanded: true, teaserMessage: 'Need a hand?' };

  it('shows the teaser above the launcher once it is revealed', () => {
    renderShell({ ...teaser, showTeaser: true });
    expect(screen.getByRole('status')).toHaveTextContent('Need a hand?');
    expect(screen.getByRole('button', { name: /open/i })).toBeInTheDocument();
  });

  it('mounts it hidden first so the iframe can be sized to it', () => {
    const onTeaserMeasure = jest.fn();
    renderShell({ ...teaser, showTeaser: false, onTeaserMeasure });
    expect(screen.getByRole('status', { hidden: true })).toHaveStyle({ visibility: 'hidden' });
    expect(onTeaserMeasure).toHaveBeenCalled();
  });

  it('dismisses without opening, and the bubble opens the chat', () => {
    const onDismissTeaser = jest.fn();
    const toggleCollapsed = jest.fn();
    renderShell({ ...teaser, showTeaser: true, onDismissTeaser, toggleCollapsed });
    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }));
    expect(onDismissTeaser).toHaveBeenCalled();
    expect(toggleCollapsed).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('status'));
    expect(toggleCollapsed).toHaveBeenCalled();
  });

  it('renders no bubble when no teaser is configured', () => {
    renderShell({ isCollapsed: true, teaserConfigured: false, teaserMessage: 'Need a hand?', showTeaser: true });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
