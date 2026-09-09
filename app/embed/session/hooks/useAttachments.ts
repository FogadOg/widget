import { useCallback, useEffect, useRef, useState } from 'react';
import * as helpers from '../helpers';
import { EMBED_EVENTS } from '../../../../lib/embedConstants';
// Note: lib/logger also exports a logError, but it takes a string. This is the
// Error-taking one the controller uses here.
import { logError } from '../../../../lib/errorHandling';
import type { MessageAttachment } from '../../../../types/widget';

/**
 * File-upload composer state.
 *
 * Owns the files a visitor has uploaded (server-side) but not yet sent. Uploads
 * happen immediately on pick; the resulting attachments sit here until the next
 * send drains them.
 *
 * `pendingAttachmentsRef` mirrors the state so the send path can read the
 * current value without taking a dependency on it — handleSubmit is a
 * useCallback with a deliberately narrow dep list, and re-creating it on every
 * attachment change would churn every consumer that holds it.
 */
export function useAttachments({
  sessionId,
  sessionIdRef,
  authToken,
  authTokenRef,
  parentSensitiveOrigin,
  t,
  setError,
}: {
  sessionId: string | null;
  sessionIdRef: React.MutableRefObject<string | null>;
  authToken: string | null | undefined;
  authTokenRef: React.MutableRefObject<string | null>;
  parentSensitiveOrigin: string | null;
  t: Record<string, unknown>;
  setError: (message: string) => void;
}) {
  const [pendingAttachments, setPendingAttachments] = useState<MessageAttachment[]>([]);
  const [uploadingFiles, setUploadingFiles] = useState(0);
  const pendingAttachmentsRef = useRef<MessageAttachment[]>([]);
  useEffect(() => { pendingAttachmentsRef.current = pendingAttachments; }, [pendingAttachments]);

  const handlePickFiles = useCallback(async (files: FileList | File[]) => {
    const list = Array.from(files || []);
    if (list.length === 0) return;
    const sid = sessionIdRef.current || sessionId;
    const token = authTokenRef.current || authToken;
    if (!sid || !token) {
      setError(String(t.sessionOrAuthError) || 'Session or authentication error');
      return;
    }
    for (const file of list) {
      setUploadingFiles((n) => n + 1);
      try {
        const attachment = await helpers.uploadSessionFile(sid, file, token);
        setPendingAttachments((prev) => [...prev, attachment]);
        if (parentSensitiveOrigin) {
          try {
            window.parent.postMessage(
              { type: EMBED_EVENTS.FILE_UPLOADED, data: attachment },
              parentSensitiveOrigin,
            );
          } catch {
            // host may be navigating — non-fatal
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(t.failedToSendMessage));
        logError(err instanceof Error ? err : new Error(String(err)), { action: 'uploadSessionFile' });
      } finally {
        setUploadingFiles((n) => Math.max(0, n - 1));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, authToken, parentSensitiveOrigin, t]);

  const handleRemoveAttachment = useCallback((id: string) => {
    setPendingAttachments((prev) => prev.filter((a) => a.id !== id));
  }, []);

  return {
    pendingAttachments,
    setPendingAttachments,
    uploadingFiles,
    setUploadingFiles,
    pendingAttachmentsRef,
    handlePickFiles,
    handleRemoveAttachment,
  };
}
