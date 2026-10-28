'use client';

import React from 'react';
import { t as translate } from '../../lib/i18n';
import { COMPANY_NAME } from '../../lib/constants';

type PoweredByFooterProps = {
  locale: string;
  textColor: string;
  mutedTextColor: string;
  /**
   * Optional pre-resolved label. The classic shell already resolves `poweredBy`
   * through its own translation bundle (`useClassicShell`), so it passes the
   * string it has; the minimal and panel shells let this fall back to
   * `translate(locale, 'poweredBy')`.
   */
  poweredByLabel?: string;
};

/**
 * The free-tier "Powered by" footer, plus the EU/GDPR hosting note.
 *
 * Callers are responsible for the `hide_branding` check — this component always
 * renders. Gate it at the call site with `{!widgetConfig?.hide_branding && ...}`
 * so the flag is visible in each shell rather than buried one level down.
 *
 * Extracted so every layout variant shows the badge. It previously lived inline
 * in FloatingView and EmbeddedView only, which meant a free org on the `minimal`
 * or `panel` layout silently shipped an unbranded widget — `layout_variant` is
 * not plan-gated, so that was a free way out of the badge.
 */
export function PoweredByFooter({
  locale,
  textColor,
  mutedTextColor,
  poweredByLabel,
}: PoweredByFooterProps) {
  const label = poweredByLabel ?? translate(locale, 'poweredBy');
  const gdprLabel = translate(locale, 'euHostedGdpr');

  return (
    <div data-part="powered-by"
      // No "·" between the two items: as its own flex item it was stranded at
      // the end of the first line whenever the row wrapped (it does at ~350px).
      // The gap separates them on one line and stacks them cleanly when not.
      className="p-2 text-center text-xs flex items-center justify-center gap-x-3 gap-y-1 flex-wrap"
      style={{ color: mutedTextColor }}
    >
      <span className="inline-flex items-center gap-1.5" title={gdprLabel}>
        <span
          aria-hidden
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '16px',
            height: '16px',
            borderRadius: '9999px',
            backgroundColor: '#1e40af',
            overflow: 'hidden',
          }}
        >
          <svg viewBox="0 0 16 16" width="16" height="16" focusable="false" aria-hidden="true">
            <g fill="#facc15">
              <circle cx="8" cy="2.6" r="0.55" />
              <circle cx="10.7" cy="3.35" r="0.55" />
              <circle cx="12.65" cy="5.3" r="0.55" />
              <circle cx="13.4" cy="8" r="0.55" />
              <circle cx="12.65" cy="10.7" r="0.55" />
              <circle cx="10.7" cy="12.65" r="0.55" />
              <circle cx="8" cy="13.4" r="0.55" />
              <circle cx="5.3" cy="12.65" r="0.55" />
              <circle cx="3.35" cy="10.7" r="0.55" />
              <circle cx="2.6" cy="8" r="0.55" />
              <circle cx="3.35" cy="5.3" r="0.55" />
              <circle cx="5.3" cy="3.35" r="0.55" />
            </g>
          </svg>
        </span>
        <span>{gdprLabel}</span>
      </span>
      <span>
        {/* The separating space is rendered here, not carried as trailing
            whitespace in the string. Only `en` had it ("Powered by "), so every
            other locale ran the label into the link — "Drevet avCompanin",
            "Alimenté parCompanin" — on every page of the merchant's site. */}
        {label.trimEnd()}{' '}
        <a
          href="https://companin.tech"
          target="_blank"
          rel="noopener noreferrer"
          className="underline-offset-2 hover:underline"
          style={{ color: textColor, fontWeight: 500 }}
        >
          {COMPANY_NAME}
        </a>
      </span>
    </div>
  );
}

export default PoweredByFooter;
