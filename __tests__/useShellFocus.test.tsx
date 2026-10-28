import { act, renderHook } from '@testing-library/react';
import { useShellFocus } from '../components/components/useShellFocus';

const setup = (isCollapsed: boolean) => {
  const inputRef = { current: null as HTMLTextAreaElement | null };
  const launcherRef = { current: null as HTMLButtonElement | null };
  const hook = renderHook(
    (props: { isCollapsed: boolean }) => useShellFocus({ ...props, inputRef, launcherRef }),
    { initialProps: { isCollapsed } },
  );
  return { ...hook, inputRef, launcherRef };
};

describe('useShellFocus', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    document.body.innerHTML = '';
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  test('focuses the composer when the panel opens', () => {
    const { rerender, inputRef } = setup(true);
    const input = document.createElement('textarea');
    document.body.appendChild(input);
    inputRef.current = input;

    rerender({ isCollapsed: false });
    act(() => {
      jest.advanceTimersByTime(100);
    });

    expect(document.activeElement).toBe(input);
  });

  test('returns focus to the launcher when the panel closes', () => {
    // A keyboard visitor must not be dropped at the top of the host page.
    const { rerender, launcherRef } = setup(true);
    const launcher = document.createElement('button');
    document.body.appendChild(launcher);
    launcherRef.current = launcher;

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

    setup(true);
    act(() => {
      jest.advanceTimersByTime(100);
    });

    expect(document.activeElement).toBe(outside);
  });
});
