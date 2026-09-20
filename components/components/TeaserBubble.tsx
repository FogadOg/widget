'use client';

import React, { useLayoutEffect, useRef } from 'react';
import { t as translate } from '../../lib/i18n';
import { FOCUS_RING } from '../EmbedShell.constants';

type Props = {
  /** Bubble is mounted (hidden) while the iframe is being sized for it. */
  teaserExpanded: boolean;
  /** Revealed once the parent's resize transition has settled. */
  showTeaser: boolean;
  teaserMessage: string | null | undefined;
  onTeaserMeasure?: (size: { width: number; height: number }) => void;
  onDismissTeaser?: () => void;
  onOpen: () => void;
  locale: string;
  backgroundColor: string;
  textColor: string;
  mutedTextColor: string;
  subtleBorderColor: string;
  fontStyles?: React.CSSProperties;
};

/**
 * The proactive teaser speech bubble shown above the collapsed launcher.
 *
 * Mirrors the classic shell's bubble (EmbeddedView). The minimal and panel
 * layouts used to render no teaser at all while the controller still grew the
 * iframe for one — leaving an invisible 280x188 box that swallowed clicks on
 * the host page and never showed the merchant's message.
 */
export function TeaserBubble({
  teaserExpanded,
  showTeaser,
  teaserMessage,
  onTeaserMeasure,
  onDismissTeaser,
  onOpen,
  locale,
  backgroundColor,
  textColor,
  mutedTextColor,
  subtleBorderColor,
  fontStyles,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);

  // Measure as soon as it renders (hidden at first) so the iframe is sized to
  // the bubble's real footprint rather than reserving a wide click-blocking strip.
  useLayoutEffect(() => {
    if (!teaserExpanded || !teaserMessage || !onTeaserMeasure) return;
    const el = ref.current;
    if (el) onTeaserMeasure({ width: el.offsetWidth, height: el.offsetHeight });
  }, [teaserExpanded, teaserMessage, onTeaserMeasure]);

  if (!teaserMessage || !(teaserExpanded || showTeaser)) return null;

  return (
    <div
      ref={ref}
      role="status"
      aria-live="polite"
      style={{
        // Pulled out of flow while hidden: the iframe is still button-sized and
        // would otherwise squeeze the text into an unrepresentative footprint.
        ...(showTeaser
          ? { position: 'relative' as const }
          : { position: 'absolute' as const, bottom: 0, right: 0, width: 'max-content' as const }),
        maxWidth: '240px',
        backgroundColor,
        color: textColor,
        border: `1px solid ${subtleBorderColor}`,
        borderRadius: '12px',
        padding: '10px 32px 10px 14px',
        boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
        cursor: 'pointer',
        lineHeight: '1.5',
        visibility: showTeaser ? 'visible' : 'hidden',
        ...fontStyles,
      }}
      className={showTeaser ? 'teaser-bubble-enter' : undefined}
      onClick={onOpen}
    >
      <p style={{ margin: 0 }}>{teaserMessage}</p>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onDismissTeaser?.(); }}
        aria-label={translate(locale, 'dismiss')}
        style={{
          position: 'absolute',
          top: '6px',
          right: '8px',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: mutedTextColor,
          fontSize: '16px',
          lineHeight: 1,
          padding: '2px 4px',
        }}
        className={FOCUS_RING}
      >
        ×
      </button>
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          bottom: '-6px',
          right: '22px',
          width: '12px',
          height: '12px',
          backgroundColor,
          transform: 'rotate(45deg)',
          boxShadow: '2px 2px 4px rgba(0,0,0,0.1)',
        }}
      />
    </div>
  );
}
