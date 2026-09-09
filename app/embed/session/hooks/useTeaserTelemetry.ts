import { useCallback, useEffect, useRef, useState } from 'react';
import { trackEvent } from '../../../../lib/api';

/**
 * Teaser impression/dismissal telemetry, plus the measured bubble footprint.
 *
 * Sits on top of the teaser bubble hook (which owns whether a teaser shows);
 * this only reports on it and wraps dismissal so an explicit "no thanks" is
 * distinguishable from a nudge that was merely ignored.
 */
export function useTeaserTelemetry({
  showTeaser,
  activeRuleId,
  hostPagePath,
  exitIntentFired,
  dismissTeaser,
  initialAgentId,
  initialClientId,
  embedHeaders,
}: {
  showTeaser: boolean;
  activeRuleId: string | null;
  hostPagePath: string | null;
  exitIntentFired: boolean;
  dismissTeaser: () => void;
  initialAgentId: string;
  initialClientId: string;
  embedHeaders: Record<string, string>;
}) {
  // Impression telemetry. Reported once per rendered nudge, carrying the rule
  // it came from so open-rate per rule is a group-by rather than a guess. The
  // ref keys on the rule so a later navigation that resolves a different rule
  // can still report, while re-renders of the same one can't double-count
  // (the ingest view would drop those as duplicates anyway).
  const reportedTeaserRef = useRef<string | null>(null);
  // Read by toggleCollapsed, which is deliberately kept out of this state's
  // dependency list — it is passed to many children, so re-creating it on every
  // teaser tick would churn the whole tree.
  const teaserVisibleRef = useRef(false);
  const teaserRuleRef = useRef<string | null>(null);
  useEffect(() => {
    teaserVisibleRef.current = showTeaser;
    teaserRuleRef.current = activeRuleId;
  }, [showTeaser, activeRuleId]);

  const teaserAttribution = useCallback(
    () => ({
      rule_id: activeRuleId,
      page_path: hostPagePath,
      trigger: exitIntentFired && activeRuleId ? 'exit_intent' : 'dwell',
    }),
    [activeRuleId, hostPagePath, exitIntentFired],
  );

  useEffect(() => {
    if (!showTeaser) return;
    const key = `${activeRuleId ?? '__default__'}:${hostPagePath ?? ''}`;
    if (reportedTeaserRef.current === key) return;
    reportedTeaserRef.current = key;
    trackEvent('teaser_shown', initialAgentId, teaserAttribution(), initialClientId, undefined, embedHeaders)
      .catch(() => {});
  }, [showTeaser, activeRuleId, hostPagePath, initialAgentId, initialClientId, embedHeaders, teaserAttribution]);

  const handleDismissTeaser = useCallback(() => {
    trackEvent('teaser_dismissed', initialAgentId, teaserAttribution(), initialClientId, undefined, embedHeaders)
      .catch(() => {});
    dismissTeaser();
  }, [dismissTeaser, initialAgentId, initialClientId, embedHeaders, teaserAttribution]);

  // Rendered footprint of the teaser bubble, reported by EmbedShell so the
  // iframe is sized to the actual message instead of the bubble's max-width.
  const [teaserSize, setTeaserSize] = useState<{ width: number; height: number } | null>(null);
  const handleTeaserMeasure = useCallback((size: { width: number; height: number }) => {
    setTeaserSize((prev) =>
      prev && prev.width === size.width && prev.height === size.height ? prev : size
    );
  }, []);

  return {
    teaserVisibleRef,
    teaserRuleRef,
    teaserAttribution,
    handleDismissTeaser,
    teaserSize,
    setTeaserSize,
    handleTeaserMeasure,
  };
}
