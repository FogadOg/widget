import { act, fireEvent, renderHook } from '@testing-library/react';
import { useShellChrome } from '../hooks/useShellChrome';

/** Give the hook a scroll container with controllable geometry. */
const attachScroller = (
  ref: React.RefObject<HTMLDivElement | null>,
  { scrollHeight, scrollTop, clientHeight }: Record<string, number>,
) => {
  const el = document.createElement('div');
  Object.defineProperty(el, 'scrollHeight', { value: scrollHeight, configurable: true });
  Object.defineProperty(el, 'clientHeight', { value: clientHeight, configurable: true });
  el.scrollTop = scrollTop;
  el.scrollTo = jest.fn();
  document.body.appendChild(el);
  (ref as { current: HTMLDivElement | null }).current = el;
  return el;
};

const baseArgs = {
  isCollapsed: true,
  toggleCollapsed: jest.fn(),
  scrollDeps: [0] as readonly unknown[],
};

const setup = (over: Record<string, unknown> = {}) => {
  const toggleCollapsed = jest.fn();
  const hook = renderHook(
    (props: Record<string, unknown>) =>
      useShellChrome({ ...(baseArgs as never), toggleCollapsed, ...(props as never) }),
    { initialProps: over },
  );
  return { ...hook, toggleCollapsed };
};

const pressEscape = () => {
  const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
  jest.spyOn(event, 'stopPropagation');
  act(() => {
    window.dispatchEvent(event);
  });
  return event;
};

describe('useShellChrome', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    document.body.innerHTML = '';
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  test('exposes the refs and chrome helpers', () => {
    const { result } = setup();
    expect(result.current.scrollContainerRef).toBeDefined();
    expect(result.current.inputRef).toBeDefined();
    expect(result.current.launcherRef).toBeDefined();
    expect(typeof result.current.handleScroll).toBe('function');
    expect(typeof result.current.scrollToBottom).toBe('function');
  });

  describe('Escape handling', () => {
    test('closes the unsure modal first', () => {
      const onCloseUnsureModal = jest.fn();
      setup({ isCollapsed: false, unsureModal: <div />, onCloseUnsureModal });

      pressEscape();

      expect(onCloseUnsureModal).toHaveBeenCalledTimes(1);
    });

    test('closes the handoff modal next', () => {
      const onDismissHandoff = jest.fn();
      setup({ isCollapsed: false, handoffModal: <div />, onDismissHandoff });

      pressEscape();

      expect(onDismissHandoff).toHaveBeenCalledTimes(1);
    });

    test('swallows Escape while the feedback dialog is open', () => {
      const { toggleCollapsed } = setup({
        isCollapsed: false,
        showFeedbackDialog: true,
        feedbackDialog: <div />,
      });

      pressEscape();

      expect(toggleCollapsed).not.toHaveBeenCalled();
    });

    test('collapses the panel when nothing else is open', () => {
      const { toggleCollapsed } = setup({ isCollapsed: false });

      pressEscape();

      expect(toggleCollapsed).toHaveBeenCalledTimes(1);
    });

    test('does nothing when already collapsed', () => {
      const { toggleCollapsed } = setup({ isCollapsed: true });
      pressEscape();
      expect(toggleCollapsed).not.toHaveBeenCalled();
    });

    test('respects a shell that hides its close button', () => {
      const { toggleCollapsed } = setup({ isCollapsed: false, hideCloseButton: true });
      pressEscape();
      expect(toggleCollapsed).not.toHaveBeenCalled();
    });

    test('ignores other keys', () => {
      const { toggleCollapsed } = setup({ isCollapsed: false });
      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
      });
      expect(toggleCollapsed).not.toHaveBeenCalled();
    });

    test('stops listening after unmount', () => {
      const { unmount, toggleCollapsed } = setup({ isCollapsed: false });
      unmount();
      pressEscape();
      expect(toggleCollapsed).not.toHaveBeenCalled();
    });
  });

  describe('auto-scroll', () => {
    test('sticks to the bottom while the visitor is already there', () => {
      const { result, rerender } = setup();
      const el = attachScroller(result.current.scrollContainerRef, {
        scrollHeight: 1000,
        clientHeight: 400,
        scrollTop: 590, // 10px from the bottom
      });

      rerender({ scrollDeps: [1] });

      expect(el.scrollTop).toBe(1000);
      expect(result.current.showJumpButton).toBe(false);
    });

    test('does not yank a visitor who has scrolled up', () => {
      const { result, rerender } = setup();
      const el = attachScroller(result.current.scrollContainerRef, {
        scrollHeight: 1000,
        clientHeight: 400,
        scrollTop: 0,
      });

      rerender({ scrollDeps: [1] });

      expect(el.scrollTop).toBe(0);
      expect(result.current.showJumpButton).toBe(true);
    });

    test('treats a missing container as "at the bottom"', () => {
      const { result, rerender } = setup();
      rerender({ scrollDeps: [1] });
      expect(result.current.showJumpButton).toBe(false);
    });

    test('shows the jump pill once the visitor scrolls away', () => {
      const { result } = setup();
      attachScroller(result.current.scrollContainerRef, {
        scrollHeight: 1000,
        clientHeight: 400,
        scrollTop: 0,
      });

      act(() => result.current.handleScroll());

      expect(result.current.showJumpButton).toBe(true);
    });

    test('hides the pill again near the bottom', () => {
      const { result } = setup();
      attachScroller(result.current.scrollContainerRef, {
        scrollHeight: 1000,
        clientHeight: 400,
        scrollTop: 590,
      });

      act(() => result.current.handleScroll());

      expect(result.current.showJumpButton).toBe(false);
    });

    test('scrollToBottom smooth-scrolls and clears the pill', () => {
      const { result } = setup();
      const el = attachScroller(result.current.scrollContainerRef, {
        scrollHeight: 1000,
        clientHeight: 400,
        scrollTop: 0,
      });

      act(() => result.current.scrollToBottom());

      expect(el.scrollTo).toHaveBeenCalledWith({ top: 1000, behavior: 'smooth' });
      expect(result.current.showJumpButton).toBe(false);
    });

    test('scrollToBottom is safe with no container', () => {
      const { result } = setup();
      expect(() => act(() => result.current.scrollToBottom())).not.toThrow();
    });
  });

  describe('focus handling', () => {
    test('focuses the composer when the panel opens', () => {
      const { result, rerender } = setup({ isCollapsed: true });
      const input = document.createElement('textarea');
      document.body.appendChild(input);
      (result.current.inputRef as { current: HTMLElement | null }).current = input;

      rerender({ isCollapsed: false });
      act(() => {
        jest.advanceTimersByTime(100);
      });

      expect(document.activeElement).toBe(input);
    });

    test('returns focus to the launcher when the panel closes', () => {
      // A keyboard visitor must not be dropped at the top of the host page.
      const { result, rerender } = setup({ isCollapsed: true });
      const launcher = document.createElement('button');
      document.body.appendChild(launcher);
      (result.current.launcherRef as { current: HTMLElement | null }).current = launcher;

      rerender({ isCollapsed: false });
      act(() => {
        jest.advanceTimersByTime(100);
      });
      rerender({ isCollapsed: true });
      act(() => {
        jest.advanceTimersByTime(10);
      });

      expect(document.activeElement).toBe(launcher);
    });

    test('never steals focus on the initial collapsed mount', () => {
      const outside = document.createElement('input');
      document.body.appendChild(outside);
      outside.focus();

      setup({ isCollapsed: true });
      act(() => {
        jest.advanceTimersByTime(100);
      });

      expect(document.activeElement).toBe(outside);
    });
  });
});
