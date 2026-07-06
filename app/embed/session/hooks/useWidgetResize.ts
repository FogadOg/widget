import { useEffect } from 'react';
import { EMBED_EVENTS } from '../../../../lib/embedConstants';
import { DEFAULTS, SIZE_PRESETS } from '../../../../lib/constants';
import { getButtonPixelSize, getNormalizedEdgeOffset } from '../embed.utils';
import type { WidgetConfig } from '../../../../types/widget';

// When the teaser bubble is visible, the iframe must be tall enough to show
// both the bubble and the launcher. These estimates match the bubble CSS.
const TEASER_MAX_WIDTH = 240;
const TEASER_HEIGHT = 76; // bubble body + 8px tail
const TEASER_GAP = 8;
const TEASER_H_PAD = 24; // right safe-padding

export function useWidgetResize({
  widgetConfig,
  isCollapsed,
  teaserConfigured,
  initialParentOrigin,
  parentTargetOrigin,
  safePostToParent,
}: {
  widgetConfig: WidgetConfig | null;
  isCollapsed: boolean;
  teaserConfigured: boolean;
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

        if (teaserConfigured) {
          // Pre-size the iframe to fit the teaser bubble as soon as one is
          // configured — before the delay fires — so the iframe viewport is
          // already the right height when the bubble appears. A mid-session
          // resize would clip the bubble while the parent's CSS transition runs.
          const teaserWidth = Math.max(collapsedViewportSize, TEASER_MAX_WIDTH + TEASER_H_PAD);
          const teaserTotalHeight = collapsedViewportSize + TEASER_GAP + TEASER_HEIGHT;
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
  }, [widgetConfig, isCollapsed, teaserConfigured, initialParentOrigin, parentTargetOrigin]);
}
