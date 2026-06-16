"use client";

import React from 'react';
import DynamicIcon from './DynamicIcon';
import type { FlowButton } from '../types/widget';
import { getReadableTextColor } from '../lib/colors';

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
};

export default function InteractionButtons({
  buttons,
  clickedButtons,
  onButtonClick,
  primaryColor,
  buttonBorderRadius,
  fontStyles,
  getLocalizedText,
}: Props) {
  return (
    <div className="flex flex-col gap-2">
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
              backgroundColor: isClicked ? '#9ca3af' : primaryColor,
              // Contrast-aware text so light brand colors stay readable. (#10)
              color: getReadableTextColor(isClicked ? '#9ca3af' : primaryColor),
              borderRadius: `${buttonBorderRadius}px`,
              ...fontStyles
            }}
            className={`w-fit px-3 py-2 text-sm transition-opacity flex items-center gap-2 ${
              isClicked ? 'opacity-50 cursor-not-allowed' : 'hover:opacity-90'
            }`}
          >
            {button.icon && (() => {
              const name = (button.icon as string).split('-').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join('');
              return <DynamicIcon name={name} className="w-4 h-4" fallback={<span>{button.icon}</span>} />;
            })()}
            {(() => {
              // prefer localized label when available
              if (getLocalizedText) {
                const txt = getLocalizedText(button.label);
                if (txt) return txt;
              }
              const lbl = button.label;
              if (typeof lbl === 'string' && lbl) {
                return lbl;
              }
              if (lbl && typeof lbl === 'object') {
                if (lbl.en) return lbl.en;
                const first = Object.values(lbl)[0];
                if (typeof first === 'string' && first) return first;
              }
              // fallback to action text if label missing
              if (button.action) {
                return button.action;
              }
              return 'Button';
            })()}
          </button>
        );
      })}
    </div>
  );
}
