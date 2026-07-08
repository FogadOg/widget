import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, act } from '@testing-library/react';
import EmbedShell from '../components/EmbedShell';
import { useWidgetStyles } from '../hooks/useWidgetStyles';
import { minimalProps, defaultStyles } from './__fixtures__/EmbedShell.fixtures';

// convenience alias to call in tests
const widgetStylesMock = useWidgetStyles as jest.Mock;

jest.mock('../hooks/useWidgetStyles', () => ({
  useWidgetStyles: jest.fn(() => defaultStyles),
}));


jest.mock('../hooks/useWidgetTranslation', () => ({
  useWidgetTranslation: () => ({ translations: { chat: 'Chat', typeYourMessage: 'Type...', send: 'Send' } })
}));

describe('EmbedShell', () => {
  test('renders greeting and buttons when provided', () => {
    const widgetConfig = {
      greeting_message: { text: { en: 'Hi there' }, buttons: [{ id: 'b1', label: { en: 'Test' } }] }
    } as any;
    render(<EmbedShell {...minimalProps} widgetConfig={widgetConfig} />);
    expect(screen.getByText('Hi there')).toBeInTheDocument();
    expect(screen.getByText('Test')).toBeInTheDocument();
  });

  test('renders flow response using MessageBubble', () => {
    const flowResponses = [{ text: 'Flow reply', buttons: [] }];
    render(<EmbedShell {...minimalProps} flowResponses={flowResponses as any} />);
    expect(screen.getByText('Flow reply')).toBeInTheDocument();
  });

  test('input and submit buttons exist', () => {
    render(<EmbedShell {...minimalProps} />);
    expect(screen.getByPlaceholderText('Type your message...')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /send/i })).toBeInTheDocument();
  });
});

describe('EmbedShell - logo and avatar', () => {
  it('renders header logo and agent avatar when provided', () => {
    const widgetConfig: any = {
      title: { en: 'My Bot' },
      subtitle: { en: 'Sub' },
      primary_color: '#111111',
      background_color: '#ffffff',
      text_color: '#111111',
      border_radius: 8,
      font_family: 'Inter',
      font_size: 14,
      font_weight: 'normal',
      shadow_intensity: 'md',
      shadow_color: '#000000',
      size: 'md',
      button_size: 'md',
      message_bubble_radius: 8,
      button_border_radius: 6,
      opacity: 1,
      logo: 'https://example.com/logo.png',
      bot_avatar: 'https://example.com/avatar.png',
      greeting_message: { text: { en: 'Hi' }, buttons: [] },
    };

    const messages = [
      { id: 'm1', text: 'Hello from agent', from: 'agent' },
      { id: 'm2', text: 'User reply', from: 'user' }
    ];

    render(
      <EmbedShell
        isEmbedded={false}
        isCollapsed={false}
        toggleCollapsed={() => {}}
        messages={messages}
        isTyping={false}
        input={''}
        setInput={() => {}}
        handleSubmit={() => {}}
        widgetConfig={widgetConfig}
      />
    );

    // header logo should be rendered
    expect(screen.getByAltText(/logo/)).toBeInTheDocument();

    // agent avatar should be rendered (there may be multiple avatar images)
    const avatars = screen.getAllByAltText(/avatar/);
    expect(avatars.length).toBeGreaterThan(0);
  });

  describe('button click wrappers and input handling', () => {
    it('invokes interaction callback and disables button after click', () => {
      const onInteraction = jest.fn();
      const widgetConfig: any = {
        greeting_message: { text: { en: 'Hi' }, buttons: [{ id: 'b1', label: { en: 'Click' } }] },
        primary_color: '#000',
        background_color: '#fff',
        text_color: '#000',
        border_radius: 0,
        font_family: 'Inter',
        font_size: 14,
        font_weight: 'normal',
        shadow_intensity: 'md',
        shadow_color: '#000',
        size: 'sm',
        button_size: 'md',
        message_bubble_radius: 0,
        button_border_radius: 0,
        opacity: 1,
      };
      render(
        <EmbedShell
          isEmbedded={false}
          isCollapsed={false}
          toggleCollapsed={() => {}}
          messages={[]}
          isTyping={false}
          input=""
          setInput={() => {}}
          handleSubmit={() => {}}
          widgetConfig={widgetConfig}
          onInteractionButtonClick={onInteraction}
        />
      );
      const btn = screen.getByRole('button', { name: 'Click' });
      expect(btn).not.toBeDisabled();
      act(() => {
        btn.click();
      });
      expect(onInteraction).toHaveBeenCalledWith(widgetConfig.greeting_message.buttons[0]);
      // after act, the button should be disabled via clicked state
      expect(btn).toBeDisabled();
    });

    it('invokes follow-up callback and clears input on change', () => {
      const onFollow = jest.fn();
      const setInput = jest.fn();
      const flowResponses = [
        { text: 'flow text', timestamp: 1, buttons: [{ id: 'f1', label: { en: 'FlowBtn' } }] }
      ];
      const widgetConfig: any = {
        primary_color: '#000',
        background_color: '#fff',
        text_color: '#000',
        border_radius: 0,
        font_family: 'Inter',
        font_size: 14,
        font_weight: 'normal',
        shadow_intensity: 'md',
        shadow_color: '#000',
        size: 'sm',
        button_size: 'md',
        message_bubble_radius: 0,
        button_border_radius: 0,
        opacity: 1,
      };
      const { getByText, getByPlaceholderText } = render(
        <EmbedShell
          isEmbedded={false}
          isCollapsed={false}
          toggleCollapsed={() => {}}
          messages={[]}
          isTyping={false}
          input=""
          setInput={setInput}
          handleSubmit={() => {}}
          widgetConfig={widgetConfig}
          flowResponses={flowResponses}
          onFollowUpButtonClick={onFollow}
        />
      );
      // verify flow text rendered
      expect(screen.getByText('flow text')).toBeInTheDocument();

      const flowBtn = getByText('FlowBtn');
      act(() => {
        flowBtn.click();
      });
      expect(onFollow).toHaveBeenCalledWith(flowResponses[0].buttons[0]);
      const inputEl = getByPlaceholderText('Type your message...');
      // simulate change
      act(() => {
        fireEvent.change(inputEl, { target: { value: 'hello' } });
      });
      expect(setInput).toHaveBeenCalledWith('hello');
    });

    it('does not crash if interaction or follow-up callback is missing', () => {
      const widgetConfig: any = {
        greeting_message: { text: { en: 'Hi' }, buttons: [{ id: 'b1', label: { en: 'Click' } }] },
        primary_color: '#000',
        background_color: '#fff',
        text_color: '#000',
        border_radius: 0,
        font_family: 'Inter',
        font_size: 14,
        font_weight: 'normal',
        shadow_intensity: 'md',
        shadow_color: '#000',
        size: 'sm',
        button_size: 'md',
        message_bubble_radius: 0,
        button_border_radius: 0,
        opacity: 1,
      };
      const { getByText } = render(
        <EmbedShell
          isEmbedded={false}
          isCollapsed={false}
          toggleCollapsed={() => {}}
          messages={[]}
          isTyping={false}
          input=""
          setInput={() => {}}
          handleSubmit={() => {}}
          widgetConfig={widgetConfig}
        />
      );
      const btn = getByText('Click');
      act(() => {
        btn.click();
      });
      // nothing throws
    });

    it('renders collapsed toggle with fallback svg/logo/avatar cases', () => {
      const widgetConfig: any = {
        primary_color: '#000',
        background_color: '#fff',
        text_color: '#000',
        border_radius: 0,
        font_family: 'Inter',
        font_size: 14,
        font_weight: 'normal',
        shadow_intensity: 'md',
        shadow_color: '#000',
        size: 'sm',
        button_size: 'md',
        message_bubble_radius: 0,
        button_border_radius: 0,
        opacity: 1,
      };
      const { rerender } = render(
        <EmbedShell
          isEmbedded={true}
          isCollapsed={true}
          toggleCollapsed={() => {}}
          messages={[]}
          isTyping={false}
          input=""
          setInput={() => {}}
          handleSubmit={() => {}}
          widgetConfig={{ ...widgetConfig, bot_avatar: 'a.png' }}
        />
      );
      expect(screen.getByAltText(/agent avatar/)).toBeInTheDocument();
      rerender(
        <EmbedShell
          isEmbedded={true}
          isCollapsed={true}
          toggleCollapsed={() => {}}
          messages={[]}
          isTyping={false}
          input=""
          setInput={() => {}}
          handleSubmit={() => {}}
          widgetConfig={{ ...widgetConfig, logo: 'l.png' }}
        />
      );
      expect(screen.getByAltText(/logo/)).toBeInTheDocument();
      rerender(
        <EmbedShell
          isEmbedded={true}
          isCollapsed={true}
          toggleCollapsed={() => {}}
          messages={[]}
          isTyping={false}
          input=""
          setInput={() => {}}
          handleSubmit={() => {}}
          widgetConfig={widgetConfig}
        />
      );
      // fallback svg present
      expect(screen.getByRole('button')).toContainHTML('<svg');
    });

    it('displays flow response avatar when showMessageAvatars and bot_avatar provided', () => {
      const onFollow = jest.fn();
      const setInput = jest.fn();
      const flowResponses = [
        { text: 'flow text', timestamp: 1, buttons: [] }
      ];
      const widgetConfig: any = {
        bot_avatar: 'avatar.png',
        primary_color: '#000',
        background_color: '#fff',
        text_color: '#000',
        border_radius: 0,
        font_family: 'Inter',
        font_size: 14,
        font_weight: 'normal',
        shadow_intensity: 'md',
        shadow_color: '#000',
        size: 'sm',
        button_size: 'md',
        message_bubble_radius: 0,
        button_border_radius: 0,
        opacity: 1,
      };
      const { getByAltText } = render(
        <EmbedShell
          isEmbedded={false}
          isCollapsed={false}
          toggleCollapsed={() => {}}
          messages={[]}
          isTyping={false}
          input=""
          setInput={setInput}
          handleSubmit={() => {}}
          widgetConfig={widgetConfig}
          flowResponses={flowResponses}
          onFollowUpButtonClick={onFollow}
        />
      );
      expect(getByAltText(/agent avatar/)).toBeInTheDocument();
    });

    it('handles flow response with both text and buttons and avatar present', () => {
      const onFollow = jest.fn();
      const setInput = jest.fn();
      const flowResponses = [
        { text: 'hello flow', timestamp: 1, buttons: [{ id: 'b4', label: { en: 'Btn4' } }] }
      ];
      const widgetConfig: any = {
        bot_avatar: 'avatar.png',
        primary_color: '#000',
        background_color: '#fff',
        text_color: '#000',
        border_radius: 0,
        font_family: 'Inter',
        font_size: 14,
        font_weight: 'normal',
        shadow_intensity: 'md',
        shadow_color: '#000',
        size: 'sm',
        button_size: 'md',
        message_bubble_radius: 0,
        button_border_radius: 0,
        opacity: 1,
      };
      const { getByText, getByAltText } = render(
        <EmbedShell
          isEmbedded={false}
          isCollapsed={false}
          toggleCollapsed={() => {}}
          messages={[]}
          isTyping={false}
          input=""
          setInput={setInput}
          handleSubmit={() => {}}
          widgetConfig={widgetConfig}
          flowResponses={flowResponses}
          onFollowUpButtonClick={onFollow}
        />
      );
      expect(getByAltText(/agent avatar/)).toBeInTheDocument();
      expect(getByText('hello flow')).toBeInTheDocument();
      const btn = getByText('Btn4');
      act(() => {
        btn.click();
      });
      expect(onFollow).toHaveBeenCalled();
    });

    it('renders a flow with only buttons (no text) and handles click', () => {
      const onFollow = jest.fn();
      const setInput = jest.fn();
      const flowResponses = [
        { text: '', timestamp: 1, buttons: [{ id: 'only', label: { en: 'OnlyBtn' } }] }
      ];
      const widgetConfig: any = {
        bot_avatar: 'avatar.png',
        primary_color: '#000',
        background_color: '#fff',
        text_color: '#000',
        border_radius: 0,
        font_family: 'Inter',
        font_size: 14,
        font_weight: 'normal',
        shadow_intensity: 'md',
        shadow_color: '#000',
        size: 'sm',
        button_size: 'md',
        message_bubble_radius: 0,
        button_border_radius: 0,
        opacity: 1,
      };
      const { container } = render(
        <EmbedShell
          isEmbedded={false}
          isCollapsed={false}
          toggleCollapsed={() => {}}
          messages={[]}
          isTyping={false}
          input=""
          setInput={setInput}
          handleSubmit={() => {}}
          widgetConfig={widgetConfig}
          flowResponses={flowResponses}
          onFollowUpButtonClick={onFollow}
        />
      );
      const flowSection = container.querySelector('div.space-y-2');
      expect(flowSection).not.toBeNull();
      const btn = flowSection!.querySelector('button') as HTMLButtonElement;
      expect(btn).toBeInTheDocument();
      expect(btn.textContent).toContain('OnlyBtn');
      act(() => { btn.click(); });
      expect(onFollow).toHaveBeenCalledWith(flowResponses[0].buttons[0]);
    });

    it('renders only-button flow without avatar when avatars disabled', () => {
      widgetStylesMock.mockReturnValue({
        ...defaultStyles,
        showMessageAvatars: false,
      });
      const onFollow = jest.fn();
      const flowResponses = [
        { text: '', timestamp: 1, buttons: [{ id: 'btn', label: { en: 'Btn' } }] }
      ];
      const { queryByAltText, getByText } = render(
        <EmbedShell
          isEmbedded={false}
          isCollapsed={false}
          toggleCollapsed={() => {}}
          messages={[]}
          isTyping={false}
          input=""
          setInput={() => {}}
          handleSubmit={() => {}}
          widgetConfig={{ primary_color: '#000', background_color: '#fff', text_color: '#000', border_radius:0, font_family:'Inter', font_size:14, font_weight:'normal', shadow_intensity:'md', shadow_color:'#000', size:'sm', button_size:'md', message_bubble_radius:0, button_border_radius:0, opacity:1 }}
          flowResponses={flowResponses}
          onFollowUpButtonClick={onFollow}
        />
      );
      expect(queryByAltText(/agent avatar/)).toBeNull();
      act(() => {
        getByText('Btn').click();
      });
      expect(onFollow).toHaveBeenCalled();
    });

    // new tests exercising icon, fallback text, and disabled state
    it('flow buttons render icon and fallback to "Button" when label empty, disabling after click', () => {
      const onFollow = jest.fn();
      const flowResponses = [
        {
          text: 'flow with icon',
          timestamp: 1,
          buttons: [
            { id: 'b5', icon: '🔥', label: { en: '' } },
          ],
        },
      ];
      const widgetConfig: any = {
        primary_color: '#000',
        background_color: '#fff',
        text_color: '#000',
        border_radius: 0,
        font_family: 'Inter',
        font_size: 14,
        font_weight: 'normal',
        shadow_intensity: 'md',
        shadow_color: '#000',
        size: 'sm',
        button_size: 'md',
        message_bubble_radius: 0,
        button_border_radius: 0,
        opacity: 1,
      };
      const { container } = render(
        <EmbedShell
          isEmbedded={false}
          isCollapsed={false}
          toggleCollapsed={() => {}}
          messages={[]}
          isTyping={false}
          input=""
          setInput={() => {}}
          handleSubmit={() => {}}
          widgetConfig={widgetConfig}
          flowResponses={flowResponses}
          onFollowUpButtonClick={onFollow}
        />
      );
      // locate the button inside the flow container
      const flowSection = container.querySelector('div.space-y-2');
      expect(flowSection).not.toBeNull();
      const allButtons = Array.from(flowSection!.querySelectorAll('button')) as HTMLButtonElement[];
      // pick the first button that is not the copy button
      const btn = allButtons.find(b => b.getAttribute('aria-label') !== 'Copy message') as HTMLButtonElement | undefined;
      expect(btn).toBeDefined();
      expect(btn).toBeInTheDocument();
      expect(btn!.textContent).toContain('🔥');
      // click disables the button
      act(() => {
        btn.click();
      });
      expect(onFollow).toHaveBeenCalledWith(flowResponses[0].buttons[0]);
      expect(btn).toBeDisabled();
    });

    it('renders empty flow block when no text and no buttons', () => {
      const flowResponses = [{ text: '', timestamp: 1, buttons: [] }];
      const widgetConfig: any = {
        primary_color: '#000',
        background_color: '#fff',
        text_color: '#000',
        border_radius: 0,
        font_family: 'Inter',
        font_size: 14,
        font_weight: 'normal',
        shadow_intensity: 'md',
        shadow_color: '#000',
        size: 'sm',
        button_size: 'md',
        message_bubble_radius: 0,
        button_border_radius: 0,
        opacity: 1,
      };
      const { container } = render(
        <EmbedShell
          isEmbedded={false}
          isCollapsed={false}
          toggleCollapsed={() => {}}
          messages={[]}
          isTyping={false}
          input=""
          setInput={() => {}}
          handleSubmit={() => {}}
          widgetConfig={widgetConfig}
          flowResponses={flowResponses}
        />
      );
      // should render a flow container element (contains space-y-2 class) despite being empty
      const flowDivs = container.querySelectorAll('div.space-y-2');
      expect(flowDivs.length).toBeGreaterThan(0);
      expect(flowDivs[0].textContent).toBe('');
    });

    it('flows with no avatar when showMessageAvatars false', () => {
      // override mock to disable avatars
      widgetStylesMock.mockReturnValue({
        ...defaultStyles,
        showMessageAvatars: false,
      });
      const flowResponses = [
        { text: 'text', timestamp: 1, buttons: [{ id: 'b2', label: { en: 'Btn2' } }] }
      ];
      const onFollow = jest.fn();
      const setInput = jest.fn();
      const { queryByAltText, getByText } = render(
        <EmbedShell
          isEmbedded={false}
          isCollapsed={false}
          toggleCollapsed={() => {}}
          messages={[]}
          isTyping={false}
          input=""
          setInput={setInput}
          handleSubmit={() => {}}
          widgetConfig={{ primary_color: '#000', background_color: '#fff', text_color: '#000', border_radius:0, font_family:'Inter', font_size:14, font_weight:'normal', shadow_intensity:'md', shadow_color:'#000', size:'sm', button_size:'md', message_bubble_radius:0, button_border_radius:0, opacity:1 }}
          flowResponses={flowResponses}
          onFollowUpButtonClick={onFollow}
        />
      );
      expect(queryByAltText(/agent avatar/)).toBeNull();
      act(() => {
        getByText('Btn2').click();
      });
      expect(onFollow).toHaveBeenCalled();
    });

    it('handles non-embedded collapsed toggle', () => {
      const widgetConfig: any = { primary_color:'#000', background_color:'#fff', text_color:'#000', border_radius:0, font_family:'Inter', font_size:14, font_weight:'normal', shadow_intensity:'md', shadow_color:'#000', size:'sm', button_size:'md', message_bubble_radius:0, button_border_radius:0, opacity:1 };
      const { getByRole } = render(
        <EmbedShell
          isEmbedded={false}
          isCollapsed={true}
          toggleCollapsed={() => {}}
          messages={[]}
          isTyping={false}
          input=""
          setInput={() => {}}
          handleSubmit={() => {}}
          widgetConfig={{ ...widgetConfig, bot_avatar:'a.png' }}
        />
      );
      expect(getByRole('button')).toBeInTheDocument();
    });

    // Embedded mode flow response tests
    it('renders flow responses in embedded mode with text and buttons', () => {
      // Reset mock to default with avatars enabled
      widgetStylesMock.mockReturnValue(defaultStyles);

      const onFollow = jest.fn();
      const flowResponses = [
        { text: 'embedded flow', timestamp: 1, buttons: [{ id: 'emb1', label: { en: 'EmbedBtn' } }] }
      ];
      const widgetConfig: any = {
        bot_avatar: 'avatar.png',
        primary_color: '#000',
        background_color: '#fff',
        text_color: '#000',
        border_radius: 0,
        font_family: 'Inter',
        font_size: 14,
        font_weight: 'normal',
        shadow_intensity: 'md',
        shadow_color: '#000',
        size: 'sm',
        button_size: 'md',
        message_bubble_radius: 0,
        button_border_radius: 0,
        opacity: 1,
      };
      const { getByText, getByAltText } = render(
        <EmbedShell
          isEmbedded={true}
          isCollapsed={false}
          toggleCollapsed={() => {}}
          messages={[]}
          isTyping={false}
          input=""
          setInput={() => {}}
          handleSubmit={() => {}}
          widgetConfig={widgetConfig}
          flowResponses={flowResponses}
          onFollowUpButtonClick={onFollow}
        />
      );
      expect(getByText('embedded flow')).toBeInTheDocument();
      expect(getByAltText(/agent avatar/)).toBeInTheDocument();
      const btn = getByText('EmbedBtn');
      act(() => {
        btn.click();
      });
      expect(onFollow).toHaveBeenCalledWith(flowResponses[0].buttons[0]);
    });

    it('renders embedded flow with button icon and fallback label', () => {
      // Reset mock to default
      widgetStylesMock.mockReturnValue(defaultStyles);

      const onFollow = jest.fn();
      const flowResponses = [
        {
          text: '',
          timestamp: 1,
          buttons: [
            { id: 'icon-btn', icon: '⚡', label: { en: '' } },
          ],
        },
      ];
      const widgetConfig: any = {
        primary_color: '#000',
        background_color: '#fff',
        text_color: '#000',
        border_radius: 0,
        font_family: 'Inter',
        font_size: 14,
        font_weight: 'normal',
        shadow_intensity: 'md',
        shadow_color: '#000',
        size: 'sm',
        button_size: 'md',
        message_bubble_radius: 0,
        button_border_radius: 0,
        opacity: 1,
      };
      const { container } = render(
        <EmbedShell
          isEmbedded={true}
          isCollapsed={false}
          toggleCollapsed={() => {}}
          messages={[]}
          isTyping={false}
          input=""
          setInput={() => {}}
          handleSubmit={() => {}}
          widgetConfig={widgetConfig}
          flowResponses={flowResponses}
          onFollowUpButtonClick={onFollow}
        />
      );
      const flowSection = container.querySelector('div.space-y-2');
      expect(flowSection).not.toBeNull();
      const allButtons = Array.from(flowSection!.querySelectorAll('button')) as HTMLButtonElement[];
      const btn = allButtons.find(b => b.getAttribute('aria-label') !== 'Copy message') as HTMLButtonElement | undefined;
      expect(btn).toBeDefined();
      expect(btn).toBeInTheDocument();
      expect(btn!.textContent).toContain('⚡');
      expect(btn!.textContent).toContain('Button'); // fallback text
    });

    it('disables embedded flow button after click', () => {
      // Reset mock to default
      widgetStylesMock.mockReturnValue(defaultStyles);

      const onFollow = jest.fn();
      const flowResponses = [
        { text: 'click me', timestamp: 1, buttons: [{ id: 'dis-btn', label: { en: 'Click' } }] }
      ];
      const widgetConfig: any = {
        primary_color: '#000',
        background_color: '#fff',
        text_color: '#000',
        border_radius: 0,
        font_family: 'Inter',
        font_size: 14,
        font_weight: 'normal',
        shadow_intensity: 'md',
        shadow_color: '#000',
        size: 'sm',
        button_size: 'md',
        message_bubble_radius: 0,
        button_border_radius: 0,
        opacity: 1,
      };
      const { getByText } = render(
        <EmbedShell
          isEmbedded={true}
          isCollapsed={false}
          toggleCollapsed={() => {}}
          messages={[]}
          isTyping={false}
          input=""
          setInput={() => {}}
          handleSubmit={() => {}}
          widgetConfig={widgetConfig}
          flowResponses={flowResponses}
          onFollowUpButtonClick={onFollow}
        />
      );
      const btn = getByText('Click');
      expect(btn).not.toBeDisabled();
      act(() => {
        btn.click();
      });
      expect(onFollow).toHaveBeenCalled();
      expect(btn).toBeDisabled();
    });

    it('renders embedded flow without avatar when showMessageAvatars is false', () => {
      widgetStylesMock.mockReturnValue({
        ...defaultStyles,
        showMessageAvatars: false,
      });
      const onFollow = jest.fn();
      const flowResponses = [
        { text: 'no avatar', timestamp: 1, buttons: [{ id: 'nav', label: { en: 'NoAv' } }] }
      ];
      const widgetConfig: any = {
        bot_avatar: 'avatar.png',
        primary_color: '#000',
        background_color: '#fff',
        text_color: '#000',
        border_radius: 0,
        font_family: 'Inter',
        font_size: 14,
        font_weight: 'normal',
        shadow_intensity: 'md',
        shadow_color: '#000',
        size: 'sm',
        button_size: 'md',
        message_bubble_radius: 0,
        button_border_radius: 0,
        opacity: 1,
      };
      const { queryByAltText, getByText } = render(
        <EmbedShell
          isEmbedded={true}
          isCollapsed={false}
          toggleCollapsed={() => {}}
          messages={[]}
          isTyping={false}
          input=""
          setInput={() => {}}
          handleSubmit={() => {}}
          widgetConfig={widgetConfig}
          flowResponses={flowResponses}
          onFollowUpButtonClick={onFollow}
        />
      );
      expect(queryByAltText(/agent avatar/)).toBeNull();
      expect(getByText('no avatar')).toBeInTheDocument();
      act(() => {
        getByText('NoAv').click();
      });
      expect(onFollow).toHaveBeenCalled();
    });
  });
});

describe('EmbedShell - personalized greeting (logged-in user)', () => {
  beforeEach(() => {
    // Reset styles mock to default (avatars on) in case a prior suite changed it.
    widgetStylesMock.mockReturnValue(defaultStyles);
  });

  test('prepends "Hi {name}!" to the greeting when identifiedUserName is set', () => {
    const widgetConfig = {
      greeting_message: { text: { en: 'How can I help?' }, buttons: [] },
    } as any;
    render(
      <EmbedShell {...minimalProps} widgetConfig={widgetConfig} identifiedUserName="Alice" />
    );
    expect(screen.getByText('Hi Alice! How can I help?')).toBeInTheDocument();
    // The un-prefixed greeting should not also appear.
    expect(screen.queryByText('How can I help?')).toBeNull();
  });

  test('shows the plain greeting when identifiedUserName is absent', () => {
    const widgetConfig = {
      greeting_message: { text: { en: 'How can I help?' }, buttons: [] },
    } as any;
    render(<EmbedShell {...minimalProps} widgetConfig={widgetConfig} />);
    expect(screen.getByText('How can I help?')).toBeInTheDocument();
    expect(screen.queryByText(/^Hi .*!/)).toBeNull();
  });

  test('shows the plain greeting when identifiedUserName is null', () => {
    const widgetConfig = {
      greeting_message: { text: { en: 'Welcome' }, buttons: [] },
    } as any;
    render(
      <EmbedShell {...minimalProps} widgetConfig={widgetConfig} identifiedUserName={null} />
    );
    expect(screen.getByText('Welcome')).toBeInTheDocument();
  });

  test('does not render a name-only greeting when there is no greeting text', () => {
    // No greeting_message → no greeting bubble at all, even with a known user.
    render(<EmbedShell {...minimalProps} widgetConfig={{} as any} identifiedUserName="Alice" />);
    expect(screen.queryByText(/Hi Alice/)).toBeNull();
  });
});
