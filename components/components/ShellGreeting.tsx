"use client";

import React from 'react';
import InteractionButtons, { type ButtonType } from '../InteractionButtons';
import { useClickedButtons } from '../../hooks/useClickedButtons';

interface Props {
  text: string;
  buttons: ButtonType[];
  onButtonClick?: (button: ButtonType) => unknown;
  borderColor: string;
  bubbleBackground: string;
  bubbleRadius: number;
  primaryColor: string;
  buttonBorderRadius: number;
  fontStyles: Record<string, unknown>;
  getLocalizedText: (textObj: Record<string, string> | undefined) => string;
  backgroundColor: string;
  textColor: string;
}

/**
 * The pinned greeting bubble and its interaction buttons, for the minimal and
 * panel layouts. Tracks clicked buttons like the classic shell does: a button
 * stays disabled once clicked, so repeat clicks can't add another turn — or,
 * for an AI-mode button, another paid message billed to the merchant.
 */
export function ShellGreeting({
  text,
  buttons,
  onButtonClick,
  borderColor,
  bubbleBackground,
  bubbleRadius,
  primaryColor,
  buttonBorderRadius,
  fontStyles,
  getLocalizedText,
  backgroundColor,
  textColor,
}: Props) {
  const { clickedButtons, handleClick } = useClickedButtons();
  return (
    <div className="mb-3">
      <div
        className="max-w-[85%] px-3 py-2 border"
        style={{ borderColor, borderRadius: `${bubbleRadius}px`, backgroundColor: bubbleBackground, color: textColor }}
      >
        {text}
      </div>
      {buttons.length > 0 && (
        <div className="mt-2">
          <InteractionButtons
            buttons={buttons}
            clickedButtons={clickedButtons}
            onButtonClick={(button) =>
              handleClick(button, (b) => { if (onButtonClick) void onButtonClick(b as ButtonType); })
            }
            primaryColor={primaryColor}
            buttonBorderRadius={buttonBorderRadius}
            fontStyles={fontStyles}
            getLocalizedText={getLocalizedText}
            backgroundColor={backgroundColor}
            textColor={textColor}
          />
        </div>
      )}
    </div>
  );
}
