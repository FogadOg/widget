
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import EmbedShell from '../components/EmbedShell';

jest.mock('../hooks/useWidgetTranslation', () => ({
  useWidgetTranslation: () => ({
    translations: {
      chat: 'Chat',
      typeYourMessage: 'Type your message...',
      send: 'Send'
    }
  })
}));

describe('EmbedShell - Unread Badge', () => {
  // Allow `any` here for test fixture convenience
  const mockWidgetConfig = {
    title: { en: 'Test Bot' },
    subtitle: { en: 'Test Subtitle' },
    primary_color: '#111111',
    secondary_color: '#666666',
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
    button_border_radius: 8,
    opacity: 1,
    greeting_message: { text: { en: 'Hello' }, buttons: [] },
  } as any;

  const messages = [
    { id: 'm1', text: 'Hello from agent', from: 'agent' as const, timestamp: 1000 },
    { id: 'm2', text: 'User reply', from: 'user' as const, timestamp: 2000 },
    { id: 'm3', text: 'Another agent message', from: 'agent' as const, timestamp: 3000 },
  ];

  it('renders unread badge when collapsed with unread messages and show_unread_badge is true', () => {
    const configWithBadge = { ...mockWidgetConfig, show_unread_badge: true };

    render(
      <EmbedShell
        isEmbedded={true}
        isCollapsed={true}
        toggleCollapsed={jest.fn()}
        messages={messages}
        isTyping={false}
        input=""
        setInput={jest.fn()}
        handleSubmit={jest.fn()}
        widgetConfig={configWithBadge}
        unreadCount={2}
      />
    );

    // Badge should be visible
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('does not render unread badge when show_unread_badge is false', () => {
    const configWithoutBadge = { ...mockWidgetConfig, show_unread_badge: false };

    render(
      <EmbedShell
        isEmbedded={true}
        isCollapsed={true}
        toggleCollapsed={jest.fn()}
        messages={messages}
        isTyping={false}
        input=""
        setInput={jest.fn()}
        handleSubmit={jest.fn()}
        widgetConfig={configWithoutBadge}
        unreadCount={2}
      />
    );

    // Badge should not be visible
    expect(screen.queryByText('2')).not.toBeInTheDocument();
  });

  it('renders unread badge by default when show_unread_badge is undefined', () => {
    // When show_unread_badge is not specified, it should default to true
    render(
      <EmbedShell
        isEmbedded={true}
        isCollapsed={true}
        toggleCollapsed={jest.fn()}
        messages={messages}
        isTyping={false}
        input=""
        setInput={jest.fn()}
        handleSubmit={jest.fn()}
        widgetConfig={mockWidgetConfig}
        unreadCount={3}
      />
    );

    // Badge should be visible by default
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('does not render badge when unread count is 0', () => {
    const configWithBadge = { ...mockWidgetConfig, show_unread_badge: true };

    render(
      <EmbedShell
        isEmbedded={true}
        isCollapsed={true}
        toggleCollapsed={jest.fn()}
        messages={messages}
        isTyping={false}
        input=""
        setInput={jest.fn()}
        handleSubmit={jest.fn()}
        widgetConfig={configWithBadge}
        unreadCount={0}
      />
    );

    // No badge should be visible
    const button = screen.getByTitle(/open chat/i);
    expect(button).toBeInTheDocument();
    // Check that no number badge exists in the button
    expect(screen.queryByText(/^\d+$/)).not.toBeInTheDocument();
  });

  it('renders "99+" for counts over 99', () => {
    const configWithBadge = { ...mockWidgetConfig, show_unread_badge: true };

    render(
      <EmbedShell
        isEmbedded={true}
        isCollapsed={true}
        toggleCollapsed={jest.fn()}
        messages={messages}
        isTyping={false}
        input=""
        setInput={jest.fn()}
        handleSubmit={jest.fn()}
        widgetConfig={configWithBadge}
        unreadCount={150}
      />
    );

    // Badge should show 99+
    expect(screen.getByText('99+')).toBeInTheDocument();
  });

  it('does not render badge when widget is expanded', () => {
    const configWithBadge = { ...mockWidgetConfig, show_unread_badge: true };

    render(
      <EmbedShell
        isEmbedded={true}
        isCollapsed={false}
        toggleCollapsed={jest.fn()}
        messages={messages}
        isTyping={false}
        input=""
        setInput={jest.fn()}
        handleSubmit={jest.fn()}
        widgetConfig={configWithBadge}
        unreadCount={5}
      />
    );

    // Badge should not be visible when expanded
    expect(screen.queryByText('5')).not.toBeInTheDocument();
  });

  it('renders badge with correct styling for single digit', () => {
    const configWithBadge = { ...mockWidgetConfig, show_unread_badge: true };

    render(
      <EmbedShell
        isEmbedded={true}
        isCollapsed={true}
        toggleCollapsed={jest.fn()}
        messages={messages}
        isTyping={false}
        input=""
        setInput={jest.fn()}
        handleSubmit={jest.fn()}
        widgetConfig={configWithBadge}
        unreadCount={5}
      />
    );

    const badge = screen.getByText('5');
    expect(badge).toBeInTheDocument();
    // Check that badge has pulse animation class
    expect(badge).toHaveClass('animate-pulse');
  });

  it('renders badge with correct styling for double digit', () => {
    const configWithBadge = { ...mockWidgetConfig, show_unread_badge: true };

    render(
      <EmbedShell
        isEmbedded={true}
        isCollapsed={true}
        toggleCollapsed={jest.fn()}
        messages={messages}
        isTyping={false}
        input=""
        setInput={jest.fn()}
        handleSubmit={jest.fn()}
        widgetConfig={configWithBadge}
        unreadCount={42}
      />
    );

    const badge = screen.getByText('42');
    expect(badge).toBeInTheDocument();
    // Check that badge has pulse animation class
    expect(badge).toHaveClass('animate-pulse');
  });
});
