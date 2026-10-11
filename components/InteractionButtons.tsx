"use client";

import React from 'react';
import DynamicIcon from './DynamicIcon';
import type { FlowButton } from '../types/widget';
import { contrastRatioHex, getReadableTextColor, mutedOn, withAlpha } from '../lib/colors';

// generic button type, falls back to FlowButton for most widgets
export type ButtonType = FlowButton & { [key: string]: unknown };

interface Props {
  buttons: ButtonType[];
  clickedButtons: Set<string>;
  onButtonClick: (button: ButtonType) => void;
  primaryColor: string;
  buttonBorderRadius: number;
  fontStyles: Record<string, unknown>;
  showMessageAvatars?: boolean;
  getLocalizedText?: (textObj: Record<string, string> | undefined) => string;
  /** Panel background, used to keep the label readable and the disabled state
   *  theme-derived instead of a hardcoded gray. */
  backgroundColor?: string;
  /** Configured body text color, used for the disabled state. */
  textColor?: string;
};

export default function InteractionButtons({
  buttons,
  clickedButtons,
  onButtonClick,
  primaryColor,
  buttonBorderRadius,
  fontStyles,
  getLocalizedText,
  backgroundColor = '#ffffff',
  textColor = '#111111',
}: Props) {
  // These are choices the AGENT offers. Painted as solid `primaryColor` fills
  // they were pixel-identical to the visitor's own message bubbles, so on a
  // branded theme there was no way to tell an offer from something you had
  // already sent. Outlined with a faint tint reads as "pick one" instead —
  // the standard quick-reply treatment — and keeps the brand colour present.
  // The border is now this control's only boundary, so it carries WCAG 1.4.11's
  // 3:1 requirement and gets the floor. The fill stays decorative — the label
  // and the border identify the control — so a plain alpha is fine there.
  const idleBorder = mutedOn(primaryColor, backgroundColor, 0.45, 3);
  const idleFill = withAlpha(primaryColor, 0.08);
  // The brand colour as a label only when it is actually readable on the panel;
  // a pale brand would otherwise render near-invisible text.
  const idleLabel = contrastRatioHex(primaryColor, backgroundColor) >= 4.5
    ? primaryColor
    : getReadableTextColor(backgroundColor);
  return (
    <div className="flex flex-col gap-2 overflow-hidden">
      {buttons.map((button: ButtonType) => {
        const altId = (button as ButtonType)['button_id'];
        const buttonId = typeof button.id === 'string' ? button.id : (typeof altId === 'string' ? altId : '');
        const isClicked = clickedButtons.has(buttonId);
        return (
          <button
            key={buttonId}
            onClick={() => onButtonClick(button)}
            disabled={isClicked}
            type="button"
            style={{
              // Disabled state derives from the configured text color rather
              // than a hardcoded #9ca3af, which read as a grey smudge on every
              // branded or dark theme.
              backgroundColor: isClicked ? withAlpha(textColor, 0.08) : idleFill,
              borderColor: isClicked ? withAlpha(textColor, 0.2) : idleBorder,
              color: isClicked ? withAlpha(textColor, 0.6) : idleLabel,
              borderRadius: `${buttonBorderRadius}px`,
              ...fontStyles
            }}
            className={`w-fit max-w-full min-h-11 px-4 text-sm border transition-opacity flex items-center gap-2 overflow-hidden ${
              isClicked ? 'cursor-not-allowed' : 'hover:opacity-80'
            }`}
          >
            {button.icon && (() => {
              const name = (button.icon as string).split('-').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join('');
              return <DynamicIcon name={name} className="w-4 h-4 shrink-0" fallback={<span>{button.icon}</span>} />;
            })()}
            <span className="truncate">
              {(() => {
                if (getLocalizedText) {
                  const txt = getLocalizedText(button.label);
                  if (txt) return txt;
                }
                const lbl = button.label;
                if (typeof lbl === 'string' && lbl) return lbl;
                if (lbl && typeof lbl === 'object') {
                  if (lbl.en) return lbl.en;
                  const first = Object.values(lbl)[0];
                  if (typeof first === 'string' && first) return first;
                }
                if (button.action) return button.action;
                return 'Button';
              })()}
            </span>
          </button>
        );
      })}
    </div>
  );
}
