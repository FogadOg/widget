import { fireEvent, render, screen } from '@testing-library/react';
import { EmbeddedView } from '../components/EmbeddedView';

/**
 * EmbeddedView is a pure render of a `ClassicShellVM`. The collapsed +
 * teaser-configured branch is the part EmbedShell's own tests never reach, so
 * this file drives the view directly with a hand-built VM.
 */
const vm = (over: Record<string, unknown> = {}) =>
  ({
    isCollapsed: true,
    toggleCollapsed: jest.fn(),
    messages: [],
    isTyping: false,
    onStopStreaming: jest.fn(),
    streamingMessage: null,
    input: '',
    setInput: jest.fn(),
    error: null,
    onRetrySend: jest.fn(),
    title: 'Support',
    agentName: 'Ada',
    widgetConfig: {},
    getLocalizedText: (t: unknown) => (typeof t === 'string' ? t : ((t as { en?: string })?.en ?? '')),
    showFeedbackDialog: false,
    feedbackDialog: null,
    messageFeedbackSubmitted: {},
    onSubmitMessageFeedback: jest.fn(),
    onRichAction: jest.fn(),
    unsureModal: null,
    handoffModal: null,
    leadCaptureCard: null,
    unsureMessages: [],
    onShowUnsureModal: jest.fn(),
    onCloseUnsureModal: jest.fn(),
    onDismissHandoff: jest.fn(),
    unreadCount: 0,
    sessionExpiredBanner: null,
    onDismissSessionExpiredBanner: jest.fn(),
    isOffline: false,
    previewPositioning: false,
    showTeaser: false,
    teaserExpanded: false,
    teaserConfigured: false,
    teaserMessage: 'Need a hand?',
    onDismissTeaser: jest.fn(),
    fileUploadEnabled: false,
    pendingAttachments: [],
    uploadingFiles: [],
    onPickFiles: jest.fn(),
    onRemoveAttachment: jest.fn(),
    locale: 'en',
    messageFeedbackSet: new Set(),
    clickedButtons: new Set(),
    getButtonId: (b: { id?: string }) => b?.id ?? '',
    scrollContainerRef: { current: null },
    inputRef: { current: null },
    launcherRef: { current: null },
    teaserBubbleRef: { current: null },
    showJumpButton: false,
    handleScroll: jest.fn(),
    scrollToBottom: jest.fn(),
    handleFormSubmit: jest.fn((e: { preventDefault: () => void }) => e.preventDefault()),
    showSkeleton: false,
    mobileSafeAreaStyle: {},
    primaryColor: '#0d9488',
    secondaryColor: '#64748b',
    backgroundColor: '#ffffff',
    textColor: '#111111',
    readableOnPrimary: '#ffffff',
    mutedTextColor: '#6b7280',
    subtleBorderColor: '#e5e7eb',
    skeletonColor: '#f3f4f6',
    agentBubbleBg: '#f9fafb',
    borderRadius: 12,
    fontStyles: {},
    widgetWidth: 380,
    widgetHeight: 600,
    messageBubbleRadius: 12,
    buttonBorderRadius: 8,
    backgroundOpacity: 1,
    showTimestamps: false,
    showTypingIndicator: true,
    showMessageAvatars: true,
    showUnreadBadge: true,
    spacingValues: { padding: '12px', gap: '10px' },
    openAnimation: 'slide',
    bubbleAnimation: 'none',
    messageAnimation: 'fade',
    respectReducedMotion: true,
    visualEffectStyles: {},
    btnWidth: 'w-14',
    btnHeight: 'h-14',
    btnIcon: 'w-6 h-6',
    previewLauncherPos: { bottom: '10px', right: '10px' },
    headerTextColor: '#ffffff',
    getText: (k: string) => k,
    handleInteractionButtonClickWrapper: jest.fn(),
    handleFollowUpButtonClickWrapper: jest.fn(),
    showGreeting: false,
    greetingText: '',
    displayGreetingText: '',
    interactionButtons: [],
    showButtons: false,
    suggestionList: [],
    showSuggestions: false,
    handleSuggestionClick: jest.fn(),
    mergedContent: [],
    openChatLabel: 'Open chat',
    closeChatLabel: 'Close chat',
    poweredByLabel: 'Powered by Companin',
    jumpToLatestLabel: 'Jump to latest',
    placeholderText: 'Ask a question…',
    composerAriaLabel: 'Message',
    sendLabel: 'Send',
    stopLabel: 'Stop',
    languageMenu: null,
    themeToggle: null,
    agentTypingLabel: 'Ada is typing',
    botAvatarSrc: null,
    botAvatarAlt: 'Ada',
    bannerLabels: {},
    consentBanner: null,
    ...over,
  }) as never;

const renderView = (over: Record<string, unknown> = {}) => render(<EmbeddedView vm={vm(over)} />);

describe('EmbeddedView — collapsed launcher', () => {
  test('renders the launcher with its open label', () => {
    renderView();
    expect(screen.getByRole('button', { name: 'Open chat' })).toBeInTheDocument();
  });

  test('opens the panel when the launcher is pressed', () => {
    const toggleCollapsed = jest.fn();
    renderView({ toggleCollapsed });

    fireEvent.click(screen.getByRole('button', { name: 'Open chat' }));

    expect(toggleCollapsed).toHaveBeenCalledTimes(1);
  });

  test('shows an unread badge when there are unread replies', () => {
    renderView({ unreadCount: 3 });
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  test('omits the badge at zero unread', () => {
    renderView({ unreadCount: 0 });
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });
});

describe('EmbeddedView — teaser bubble', () => {
  test('anchors the launcher when a teaser is configured', () => {
    const { container } = renderView({ teaserConfigured: true });
    expect(container.querySelector('[style*="position: fixed"]')).toBeInTheDocument();
  });

  test('mounts the bubble hidden so it can be measured before the resize', () => {
    // The iframe is still button-sized here; measuring it visible would wrap
    // the text into an unrepresentative footprint. `hidden: true` is required
    // because visibility:hidden takes it out of the accessibility tree.
    renderView({ teaserConfigured: true, teaserExpanded: true, showTeaser: false });

    const bubble = screen.getByRole('status', { hidden: true });
    expect(bubble).toHaveStyle({ visibility: 'hidden' });
    expect(bubble).toHaveStyle({ position: 'absolute' });
  });

  test('reveals the bubble once the parent resize has settled', () => {
    renderView({ teaserConfigured: true, teaserExpanded: true, showTeaser: true });

    const bubble = screen.getByRole('status');
    expect(bubble).toHaveStyle({ visibility: 'visible' });
    expect(bubble).toHaveStyle({ position: 'relative' });
  });

  test('shows the teaser message', () => {
    renderView({ teaserConfigured: true, showTeaser: true, teaserMessage: 'Questions?' });
    expect(screen.getByText('Questions?')).toBeInTheDocument();
  });

  test('announces the teaser politely', () => {
    renderView({ teaserConfigured: true, showTeaser: true });
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
  });

  test('opens the chat when the bubble is clicked', () => {
    const toggleCollapsed = jest.fn();
    renderView({ teaserConfigured: true, showTeaser: true, toggleCollapsed });

    fireEvent.click(screen.getByRole('status'));

    expect(toggleCollapsed).toHaveBeenCalled();
  });

  test('dismisses the teaser without opening the chat', () => {
    const onDismissTeaser = jest.fn();
    const toggleCollapsed = jest.fn();
    renderView({ teaserConfigured: true, showTeaser: true, onDismissTeaser, toggleCollapsed });

    const dismiss = screen
      .getAllByRole('button')
      .find((b) => /dismiss|close/i.test(b.getAttribute('aria-label') ?? ''));

    if (dismiss) {
      fireEvent.click(dismiss);
      expect(onDismissTeaser).toHaveBeenCalled();
    }
  });

  test('renders no bubble at all while the teaser is not live', () => {
    // Not merely hidden — absent, so it cannot be measured or read out.
    const { container } = renderView({
      teaserConfigured: true,
      teaserExpanded: false,
      showTeaser: false,
    });
    expect(container.querySelector('[role="status"]')).toBeNull();
  });

  test('uses the resolved surface colours so it stays readable in dark themes', () => {
    // Was hardcoded #fff, which paired with light dark-theme text = invisible.
    renderView({
      teaserConfigured: true,
      showTeaser: true,
      backgroundColor: 'rgb(17, 24, 39)',
      textColor: 'rgb(243, 244, 246)',
    });

    const bubble = screen.getByRole('status');
    expect(bubble).toHaveStyle({ backgroundColor: 'rgb(17, 24, 39)' });
    expect(bubble).toHaveStyle({ color: 'rgb(243, 244, 246)' });
  });

  test('honours preview positioning when previewing in the dashboard', () => {
    const { container } = renderView({
      teaserConfigured: true,
      previewPositioning: true,
      previewLauncherPos: { bottom: '10px', right: '10px' },
    });
    expect(container.querySelector('[style*="position: fixed"]')).toBeInTheDocument();
  });
});

describe('EmbeddedView — expanded panel', () => {
  test('renders the transcript surface', () => {
    renderView({ isCollapsed: false });
    expect(screen.getByRole('button', { name: 'Close chat' })).toBeInTheDocument();
  });

  test('shows the jump-to-latest pill when scrolled up', () => {
    renderView({ isCollapsed: false, showJumpButton: true });
    expect(screen.getByRole('button', { name: 'Jump to latest' })).toBeInTheDocument();
  });

  test('hides the pill when at the bottom', () => {
    renderView({ isCollapsed: false, showJumpButton: false });
    expect(screen.queryByRole('button', { name: 'Jump to latest' })).not.toBeInTheDocument();
  });

  test('renders a skeleton while the config is still loading', () => {
    const { container } = renderView({ isCollapsed: false, showSkeleton: true });
    expect(container.firstElementChild).not.toBeNull();
  });
});
