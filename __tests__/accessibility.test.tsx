import React from 'react';
import { render } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';
import EmbedShell from '../components/EmbedShell';
import InteractionButtons from '../components/InteractionButtons';
import MessageInput from '../components/MessageInput';

expect.extend(toHaveNoViolations);

describe('accessibility checks', () => {
  it('EmbedShell has no a11y violations', async () => {
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
        error={null}
        title="Test Widget"
        agentName="Assistant"
        widgetConfig={{}} // empty config is fine
        onInteractionButtonClick={() => {}}
        onFollowUpButtonClick={() => {}}
        flowResponses={[]}
        getLocalizedText={(t) => (typeof t === 'string' ? t : t?.en || '')}
        showFeedbackDialog={false}
        messageFeedbackSubmitted={new Set()}
        unsureMessages={[]}
        unreadCount={0}
      />
    );

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('InteractionButtons has no a11y violations', async () => {
    const { container } = render(
      <InteractionButtons
        buttons={[{ id: '1', label: { en: 'Click me' } }]}
        clickedButtons={new Set()}
        onButtonClick={() => {}}
        primaryColor="#0066cc"
        buttonBorderRadius={3}
        fontStyles={{}}
      />
    );

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('MessageInput has no a11y violations', async () => {
    const { container } = render(
      <MessageInput
        sessionId="abc"
        authToken="token"
        locale="en"
        onMessageSent={() => {}}
        onError={() => {}}
        onTypingStart={() => {}}
        onTypingEnd={() => {}}
        getPageContext={() => ({ url: '', pathname: '', title: '', referrer: '' })}
      />
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
