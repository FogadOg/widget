'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

/**
 * Chrome behavior every layout shell needs: auto-scroll to the newest message,
 * the "jump to latest" affordance and Escape-to-close. Focus on open/close is
 * `useShellFocus`'s job — the shells call both.
 *
 * Extracted from the classic shell so `minimal` and `panel` can't drift from it
 * again. They previously shipped without any of this: the agent's reply landed
 * below the fold with no scroll and no jump pill, Escape did nothing, and focus
 * was never moved into the composer.
 *
 * The scroll logic is deliberately identical to the classic shell's: auto-scroll
 * only while the visitor is already near the bottom, so new content never yanks
 * them away from something they're mid-read.
 */
export function useShellChrome<TInput extends HTMLElement = HTMLTextAreaElement>({
  isCollapsed,
  toggleCollapsed,
  hideCloseButton = false,
  scrollDeps,
  unsureModal,
  onCloseUnsureModal,
  handoffModal,
  onDismissHandoff,
  showFeedbackDialog = false,
  feedbackDialog,
}: {
  isCollapsed: boolean;
  toggleCollapsed: () => void;
  hideCloseButton?: boolean;
  /** Values that should trigger a scroll check when they change (messages, typing, …). */
  scrollDeps: readonly unknown[];
  unsureModal?: React.ReactNode;
  onCloseUnsureModal?: () => void;
  handoffModal?: React.ReactNode;
  onDismissHandoff?: () => void;
  showFeedbackDialog?: boolean;
  feedbackDialog?: React.ReactNode;
}) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<TInput>(null);
  const [showJumpButton, setShowJumpButton] = useState(false);

  // Escape closes the topmost open modal first, then collapses the widget.
  // Capture phase so it wins over anything the host page has bound.
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (unsureModal && onCloseUnsureModal) {
        onCloseUnsureModal();
        e.stopPropagation();
        return;
      }
      if (handoffModal && onDismissHandoff) {
        onDismissHandoff();
        e.stopPropagation();
        return;
      }
      if (showFeedbackDialog && feedbackDialog) {
        e.stopPropagation();
        return;
      }
      if (!isCollapsed && !hideCloseButton) {
        toggleCollapsed();
        e.stopPropagation();
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown, true);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown, true);
  }, [
    isCollapsed,
    hideCloseButton,
    toggleCollapsed,
    unsureModal,
    onCloseUnsureModal,
    handoffModal,
    onDismissHandoff,
    showFeedbackDialog,
    feedbackDialog,
  ]);

  const shouldAutoScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return true;
    const threshold = 64; // px from bottom
    return el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
  }, []);

  // useLayoutEffect so the scroll position is read and written before paint —
  // otherwise the visitor sees a frame of the old position on every new message.
  useLayoutEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    if (shouldAutoScroll()) {
      el.scrollTop = el.scrollHeight;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShowJumpButton(false);
    } else {
      setShowJumpButton(true);
    }
    // The caller owns what counts as "new content"; spreading it here keeps the
    // hook agnostic about which shell's data shape it's watching.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, scrollDeps);

  // Opening the panel mounts the log at scrollTop 0. History restored while the
  // widget was collapsed changed `scrollDeps` before the container existed, so
  // the check above returned early then — land on the newest message now.
  useLayoutEffect(() => {
    if (isCollapsed) return;
    const el = scrollContainerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShowJumpButton(false);
  }, [isCollapsed]);

  const handleScroll = useCallback(() => {
    setShowJumpButton(!shouldAutoScroll());
  }, [shouldAutoScroll]);

  const scrollToBottom = useCallback(() => {
    const el = scrollContainerRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    setShowJumpButton(false);
  }, []);

  return {
    scrollContainerRef,
    inputRef,
    showJumpButton,
    handleScroll,
    scrollToBottom,
  };
}
