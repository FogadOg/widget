import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';

// Mock react-markdown to simulate basic bold parsing so the component
// takes the ReactMarkdown branch during tests.
jest.mock('react-markdown', () => ({
  __esModule: true,
  default: (props: any) => {
    const children = props?.children ?? '';
    // simple parser: convert **text** into <strong>text</strong>
    const parts: any[] = [];
    const str = typeof children === 'string' ? children : String(children);
    let lastIndex = 0;
    const re = /\*\*(.+?)\*\*/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(str)) !== null) {
      if (m.index > lastIndex) parts.push(str.substring(lastIndex, m.index));
      parts.push(React.createElement('strong', { key: m[1] }, m[1]));
      lastIndex = re.lastIndex;
    }
    if (lastIndex < str.length) parts.push(str.substring(lastIndex));
    return React.createElement('div', null, parts);
  },
}));

jest.mock('remark-gfm', () => ({ __esModule: true, default: () => null }));

jest.mock('../hooks/useWidgetTranslation', () => ({ useWidgetTranslation: () => ({ locale: 'en', translations: {} }) }));
jest.mock('../lib/i18n', () => ({ t: (_l: string, k: string) => k }));

import MessageBubble from '../components/MessageBubble';

test('renders markdown when react-markdown is available', async () => {
  const message = { id: 'm-md', text: 'Hello **world**', from: 'agent' } as any;
  render(<MessageBubble message={message} />);
  // wait for dynamic import to resolve and markdown to render
  expect(await screen.findByText('world')).toBeInTheDocument();
  expect(await screen.findByRole('button', { name: 'copyMessage' })).toBeInTheDocument();
});

test('copy fallback uses execCommand when clipboard API missing', async () => {
  const message = { id: 'm-cb', text: 'copy me', from: 'agent' } as any;
  // make clipboard reject so the promise catch branch runs
  // @ts-ignore
  const originalClipboard = navigator.clipboard;
  // @ts-ignore
  navigator.clipboard = { writeText: jest.fn().mockRejectedValue(new Error('copy failed')) } as any;
  // ensure execCommand exists so we can spy on it
  // @ts-ignore
  if (typeof document.execCommand === 'undefined') document.execCommand = () => true;
  // now spy
  // @ts-ignore
  const execSpy = jest.spyOn(document, 'execCommand').mockImplementation(() => true);

  render(<MessageBubble message={message} />);
  const btn = await screen.findByRole('button', { name: 'copyMessage' });
  await act(async () => {
    fireEvent.click(btn);
    await Promise.resolve();
  });
  const copied = await screen.findByRole('button', { name: 'copied' });
  expect(copied).toBeInTheDocument();

  execSpy.mockRestore();
  // @ts-ignore
  navigator.clipboard = originalClipboard;
});
