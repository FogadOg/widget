import { useCallback, useRef, useState } from 'react';

export function useStreamingMessage() {
  const [streamingMessage, setStreamingMessage] = useState<string | null>(null);
  const streamAbortControllerRef = useRef<AbortController | null>(null);
  const streamAccumulatedRef = useRef<string>('');
  const streamUserAbortedRef = useRef(false);
  const streamPartialDroppedRef = useRef(false);

  const handleStopStreaming = useCallback(() => {
    streamUserAbortedRef.current = true;
    streamAbortControllerRef.current?.abort();
  }, []);

  return {
    streamingMessage,
    setStreamingMessage,
    streamAbortControllerRef,
    streamAccumulatedRef,
    streamUserAbortedRef,
    streamPartialDroppedRef,
    handleStopStreaming,
  };
}
