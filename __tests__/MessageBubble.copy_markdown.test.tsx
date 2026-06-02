import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';

jest.mock('react-markdown', () => ({
  __esModule: true,
  default: (props: any) => {
    const children = props?.children ?? '';
    const components = props?.components ?? {};
    const str = typeof children === 'string' ? children : String(children);
    // link pattern [text](url)
    const linkRe = /\[([^\]]+)\]\(([^)]+)\)/;
    const codeBlockRe = /```([a-zA-Z0-9-]*)\n([\s\S]*?)```/;
    const inlineCodeRe = /`([^`]+)`/;

    if (codeBlockRe.test(str)) {
      const m = codeBlockRe.exec(str)!;
      const lang = m[1] ? `language-${m[1]}` : undefined;
      return React.createElement('div', null, components.code ? components.code({ className: lang, children: m[2] }) : React.createElement('code', { className: lang }, m[2]));
    }

    if (linkRe.test(str)) {
      const m = linkRe.exec(str)!;
      return React.createElement('div', null, components.a ? components.a({ href: m[2], children: m[1] }) : React.createElement('a', { href: m[2] }, m[1]));
    }

    if (inlineCodeRe.test(str)) {
      const m = inlineCodeRe.exec(str)!;
      return React.createElement('div', null, components.code ? components.code({ children: m[1] }) : React.createElement('code', null, m[1]));
    }

    return React.createElement('div', null, str);
  },
}));

jest.mock('remark-gfm', () => ({ __esModule: true, default: () => null }));

jest.mock('../hooks/useWidgetTranslation', () => ({ useWidgetTranslation: () => ({ locale: 'en', translations: {} }) }));
jest.mock('../lib/i18n', () => ({ t: (_l: string, k: string) => k }));

import MessageBubble from '../components/MessageBubble';

describe('MessageBubble copy and markdown integrations', () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  test('clicking copy uses clipboard API and resets `copied` after timeout', async () => {
    jest.useFakeTimers();
    const message = { id: 'm-copy-ok', text: 'copy me', from: 'agent' } as any;
    // mock clipboard
    // ensure clipboard exists in this environment
    // @ts-ignore
    if (!navigator.clipboard) navigator.clipboard = { writeText: async () => {} } as any;
    // @ts-ignore
    const writeSpy = jest.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined as any);

    render(<MessageBubble message={message} />);
    const btn = await screen.findByRole('button', { name: 'copyMessage' });
    await act(async () => {
      fireEvent.click(btn);
      await Promise.resolve();
    });

    // copied state should reflect immediately
    expect(await screen.findByRole('button', { name: 'copied' })).toBeInTheDocument();

    // advance timeout to clear copied
    await act(async () => {
      jest.advanceTimersByTime(2000);
    });
    expect(screen.getByRole('button', { name: 'copyMessage' })).toBeInTheDocument();

    writeSpy.mockRestore();
  });

  test('clipboard missing falls back to execCommand and resets `copied` after timeout', async () => {
    jest.useFakeTimers();
    const message = { id: 'm-copy-fallback', text: 'copy fallback', from: 'agent' } as any;
    // simulate clipboard present but writeText failing so the promise .catch branch runs
    // @ts-ignore
    const originalClipboard = navigator.clipboard;
    // @ts-ignore
    navigator.clipboard = { writeText: jest.fn().mockRejectedValue(new Error('nope')) } as any;
    // ensure execCommand exists
    // @ts-ignore
    if (typeof document.execCommand === 'undefined') document.execCommand = () => true;
    // spy on execCommand
    // @ts-ignore
    const execSpy = jest.spyOn(document, 'execCommand').mockImplementation(() => true);

    // spy on append/remove to ensure textarea used
    const appendSpy = jest.spyOn(document.body, 'appendChild');
    const removeSpy = jest.spyOn(document.body, 'removeChild');

    render(<MessageBubble message={message} />);
    const btn = await screen.findByRole('button', { name: 'copyMessage' });
    await act(async () => {
      fireEvent.click(btn);
      await Promise.resolve();
    });

    expect(execSpy).toHaveBeenCalled();
    expect(await screen.findByRole('button', { name: 'copied' })).toBeInTheDocument();
    // textarea should have been appended then removed
    expect(appendSpy).toHaveBeenCalled();
    expect(removeSpy).toHaveBeenCalled();
    await act(async () => {
      jest.advanceTimersByTime(2000);
    });
    expect(screen.getByRole('button', { name: 'copyMessage' })).toBeInTheDocument();

    execSpy.mockRestore();
    // @ts-ignore
    navigator.clipboard = originalClipboard;
  });

  test('react-markdown components mapping: link opens new tab and code renders block/inline', async () => {
    const linkMsg = { id: 'm-link', text: 'see [site](https://ex.com)', from: 'agent' } as any;
    render(<MessageBubble message={linkMsg} />);
    const anchor = await screen.findByRole('link');
    expect(anchor).toHaveAttribute('href', 'https://ex.com');
    expect(anchor).toHaveAttribute('target', '_blank');
    expect(anchor).toHaveAttribute('rel', 'noopener noreferrer');

    const inlineCodeMsg = { id: 'm-icode', text: 'inline `x`', from: 'agent' } as any;
    render(<MessageBubble message={inlineCodeMsg} />);
    const code = await screen.findByText('x');
    expect(code.tagName.toLowerCase()).toBe('code');

    const blockMsg = { id: 'm-bcode', text: '```js\nconst a = 1\n```', from: 'agent' } as any;
    render(<MessageBubble message={blockMsg} />);
    const pre = await screen.findByText(/const a = 1/);
    expect(pre).toBeInTheDocument();
  });
});
