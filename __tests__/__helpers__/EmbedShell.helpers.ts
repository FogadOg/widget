import React from 'react';
import { render } from '@testing-library/react';
import EmbedShell from '../../components/EmbedShell';
import { baseWidgetConfig, defaultStyles } from '../__fixtures__/EmbedShell.fixtures';

export function createWidgetConfig(overrides: Record<string, any> = {}): any {
  return { ...baseWidgetConfig, ...overrides } as any;
}

export function resetWidgetStylesMock(widgetStylesMock: jest.Mock): void {
  widgetStylesMock.mockReturnValue(defaultStyles);
}

export function renderEmbedShell(props: Partial<React.ComponentProps<typeof EmbedShell>> & { widgetConfig: any }) {
  const defaults = {
    isEmbedded: false,
    isCollapsed: false,
    toggleCollapsed: () => {},
    messages: [],
    isTyping: false,
    input: '',
    setInput: () => {},
    handleSubmit: () => {},
  };
  return render(React.createElement(EmbedShell, { ...defaults, ...props } as any));
}
