import { useEffect } from 'react';
import { EMBED_EVENTS } from '../../../../lib/embedConstants';
import { DEFAULTS, SIZE_PRESETS } from '../../../../lib/constants';
import { getButtonPixelSize, getNormalizedEdgeOffset } from '../embed.utils';
import type { WidgetConfig } from '../../../../types/widget';

// When the teaser bubble is visible, the iframe must be big enough to show
// both the bubble and the launcher. The rendered bubble is measured
// (EmbedShell → onTeaserMeasure) so the iframe hugs the actual message;
// these estimates are only the fallback until the measurement lands.
const TEASER_MAX_WIDTH = 240;
const TEASER_HEIGHT = 76; // bubble body + 8px tail
const TEASER_GAP = 8;
const TEASER_H_PAD = 24; // safe-padding for bubble shadow / edge offset

export function useWidgetResize({
  widgetConfig,
  isCollapsed,
  teaserExpanded,
  teaserSize,
  initialParentOrigin,
  parentTargetOrigin,
  safePostToParent,
}: {
  widgetConfig: WidgetConfig | null;
  isCollapsed: boolean;
  teaserExpanded: boolean;
  /** Measured footprint of the rendered teaser bubble; null until it mounts. */
  teaserSize: { width: number; height: number } | null;
  initialParentOrigin: string | undefined;
  parentTargetOrigin: string | null;
  safePostToParent: (payload: unknown) => void;
}) {
  useEffect(() => {
    if (widgetConfig && window.parent !== window) {
      const positionData = {
        position: widgetConfig.position || 'bottom-right',
        edge_offset: getNormalizedEdgeOffset(widgetConfig)
      };

      if (isCollapsed) {
        // Send button size when collapsed
        const buttonSize = getButtonPixelSize(widgetConfig.button_size || 'md');
        const hoverSafePadding = 24; // shadow-lg extends ~22px, badge overhangs 4px
        const collapsedViewportSize = buttonSize + (hoverSafePadding * 2);

        if (teaserExpanded) {
          // Grow the iframe only while the teaser is live. The bubble itself
          // renders ~350ms after this resize (see useTeaserBubble) so the
          // parent's 0.3s size transition finishes before the bubble appears.
          // Outside this window the iframe stays button-sized so the invisible
          // area doesn't block clicks on the host page.
          const bubbleWidth = teaserSize?.width ?? TEASER_MAX_WIDTH;
          const bubbleHeight = teaserSize?.height ?? TEASER_HEIGHT;
          // TEASER_H_PAD covers the wrapper's right offset; the extra 16px keeps
          // the bubble's box-shadow from clipping at the iframe's left edge.
          const teaserWidth = Math.max(collapsedViewportSize, bubbleWidth + TEASER_H_PAD + 16);
          const teaserTotalHeight = collapsedViewportSize + TEASER_GAP + bubbleHeight;
          safePostToParent({
            type: EMBED_EVENTS.RESIZE,
            data: {
              width: teaserWidth,
              height: teaserTotalHeight,
              ...positionData
            }
          });
        } else {
          safePostToParent({
            type: EMBED_EVENTS.RESIZE,
            data: {
              width: collapsedViewportSize,
              height: collapsedViewportSize,
              ...positionData
            }
          });
        }
      } else {
        // Send widget size when expanded — prefer `size` preset if provided.
        const sizePreset = (widgetConfig as any)?.size;
        const preset = sizePreset && (SIZE_PRESETS as any)[sizePreset] ? (SIZE_PRESETS as any)[sizePreset] : null;
        const width = preset ? preset.w : DEFAULTS.WIDGET_WIDTH;
        const height = preset ? preset.h : DEFAULTS.WIDGET_HEIGHT;
        safePostToParent({
          type: EMBED_EVENTS.RESIZE,
          data: {
            width,
            height,
            ...positionData
          }
        });
      }
    }
  }, [widgetConfig, isCollapsed, teaserExpanded, teaserSize, initialParentOrigin, parentTargetOrigin]);
}
