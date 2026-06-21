import { useEffect, useState } from 'react';
import { logError } from '../../../../lib/errorHandling';
import type { Message } from '../../../../types/widget';

export function useUnreadTracking({
  messages,
  isCollapsed,
  unreadStorageKey,
  lastReadStorageKey,
  showUnreadBadge,
}: {
  messages: Message[];
  isCollapsed: boolean;
  unreadStorageKey: string;
  lastReadStorageKey: string;
  showUnreadBadge: boolean;
}) {
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [lastReadMessageId, setLastReadMessageId] = useState<string | null>(null);

  // Load unread count and last read message from localStorage on mount
  useEffect(() => {
    const timeoutIds: number[] = [];
    try {
      const storedUnread = localStorage.getItem(unreadStorageKey);
      const storedLastRead = localStorage.getItem(lastReadStorageKey);

      if (storedUnread) {
        timeoutIds.push(window.setTimeout(() => {
          setUnreadCount(parseInt(storedUnread, 10) || 0);
        }, 0));
      }
      if (storedLastRead) {
        timeoutIds.push(window.setTimeout(() => {
          setLastReadMessageId(storedLastRead);
        }, 0));
      }
    } catch (error) {
      logError(error as Error, { context: 'loadUnreadCount' });
    }

    return () => {
      timeoutIds.forEach((id) => window.clearTimeout(id));
    };
  }, [lastReadStorageKey, unreadStorageKey]);

  // Track unread messages when new agent messages arrive and widget is collapsed
  useEffect(() => {
    // Only track unread if the feature is enabled
    if (!showUnreadBadge) {
      return;
    }

    if (isCollapsed && messages.length > 0) {
      // Get the last agent message
      const lastMessage = messages[messages.length - 1];

      if (lastMessage?.from === 'agent' && lastMessage?.id) {
        // Only count as unread if this message is after the last read message
        if (!lastReadMessageId || lastMessage.id !== lastReadMessageId) {
          // Count unread agent messages after the last read message
          const lastReadIndex = lastReadMessageId
            ? messages.findIndex(m => m.id === lastReadMessageId)
            : -1;

          const unreadMessages = messages.filter((m, idx) =>
            m.from === 'agent' &&
            idx > lastReadIndex &&
            !m.id.startsWith('greeting-') // Don't count greeting messages
          );

          const newUnreadCount = unreadMessages.length;
          const id = window.setTimeout(() => {
            setUnreadCount(newUnreadCount);
          }, 0);

          // Persist to localStorage
          try {
            localStorage.setItem(unreadStorageKey, newUnreadCount.toString());
          } catch (error) {
            logError(error as Error, { context: 'saveUnreadCount' });
          }

          return () => {
            window.clearTimeout(id);
          };
        }
      }
    }
  }, [messages, isCollapsed, lastReadMessageId, showUnreadBadge, unreadStorageKey]);

  return {
    unreadCount,
    setUnreadCount,
    lastReadMessageId,
    setLastReadMessageId,
  };
}
