import type { CSSProperties } from 'react';

export type Props = {
  clientId: string;
  agentId: string;
  configId: string;
  locale: string;
  startOpen: boolean;
  pagePath?: string;
  parentOrigin?: string;
  loaderVersion?: string;
  /** Base64-encoded JSON widget config for preview mode. When set, auth and API calls are skipped. */
  previewConfig?: string;
};

/**
 * Resolved theme for the docs widget. `vars` holds the shadcn CSS custom
 * properties (mapped from the widget config) so every ai-element themes at
 * once; the remaining fields theme the non-token chrome (header/footer borders,
 * panel surface) that uses plain inline styles.
 */
export type DocsTheme = {
  /** CSS custom properties (--primary, --background, --radius, …) + base color/font. */
  vars: CSSProperties;
  /** Outer panel background — opaque, or a translucent rgba() when a visual effect is set. */
  panelBackground: string;
  /** backdrop-filter for glassmorphism/frosted effects (undefined when 'none'). */
  backdropFilter?: string;
  /** Heading text color. */
  title: string;
  /** Muted/secondary text color. */
  subtitle: string;
  /** Hairline/border color. */
  border: string;
};

export type MessageType = {
  key: string;
  from: "user" | "agent";
  sources?: { url?: string; href?: string; title?: string; snippet?: string; type?: string; reference_id?: string }[];
  versions: {
    id: string;
    content: string;
  }[];
  reasoning?: {
    content: string;
    duration: number;
  };
};
