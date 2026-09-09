import { useCallback, useMemo } from 'react';
import { targetOrigin, sensitiveOrigin } from '../../../../lib/embedConstants';
import { resolveParentTargetOrigin } from '../embed.utils';

/**
 * Resolved origins for talking to the host page, plus the safe sender.
 *
 * Two origins, deliberately: `parentTargetOrigin` is used for low-risk
 * notifications, `parentSensitiveOrigin` gates anything carrying visitor data.
 * Both can resolve to empty for unknown/opaque embeds — in which case we
 * suppress postMessage entirely rather than broadcasting via '*'.
 */
export function useHostBridge({
  initialParentOrigin,
  isStrictOrigin,
}: {
  initialParentOrigin: string | undefined;
  isStrictOrigin: boolean;
}) {
  const parentTargetOrigin = useMemo(
    () => targetOrigin(resolveParentTargetOrigin(initialParentOrigin, undefined, isStrictOrigin) ?? undefined),
    [initialParentOrigin, isStrictOrigin],
  );

  const parentSensitiveOrigin = useMemo(
    () => sensitiveOrigin(resolveParentTargetOrigin(initialParentOrigin, undefined, isStrictOrigin) ?? undefined),
    [initialParentOrigin, isStrictOrigin],
  );

  /**
   * Sender for non-sensitive `WIDGET_RESIZE` / `WIDGET_SHOW` style messages.
   * Silently drops the call when no target origin is available; the host loader
   * still applies its own origin allowlist on the receiving side.
   */
  const safePostToParent = useCallback(
    (payload: unknown) => {
      if (!parentTargetOrigin) return;
      try {
        window.parent.postMessage(payload, parentTargetOrigin);
      } catch {
        // host page may be navigating; nothing actionable.
      }
    },
    [parentTargetOrigin],
  );

  return { parentTargetOrigin, parentSensitiveOrigin, safePostToParent };
}
