
'use client';

import React, { useState, useCallback, useEffect, useMemo } from 'react';

// Dynamically import react-markdown and remark-gfm at runtime so Jest
// doesn't try to parse ESM exports from node_modules during tests.
// When not yet loaded we render plain text so server/test environments stay compatible.
type MDComponents = Record<string, React.ComponentType<any>>;
import { t as translate } from '../lib/i18n';
import { useWidgetTranslation } from '../hooks/useWidgetTranslation';
import type { WidgetConfig } from '../types/widget';
import { normalizeHexColor, getReadableTextColor, withAlpha } from '../lib/colors';
import { STATUS_COLORS } from '../lib/constants';

type Source = { url?: string; title?: string; snippet?: string };
type Message = {
  id: string;
  text: string;
  from: 'user' | 'agent';
  timestamp?: number;
  sources?: Source[];
  metadata?: {
    safety_policy_action?: string;
    safety_decision_reason?: string;
  };
  pending?: boolean;
};

type Props = {
  message: Message;
  widgetConfig?: WidgetConfig;
  agentName?: string;
  showMessageAvatars?: boolean;
  textColor?: string;
  agentBubbleBg?: string;
  fontStyles?: Record<string, unknown>;
  messageBubbleRadius?: number;
  onSubmitMessageFeedback?: (messageId: string, feedbackType?: string) => void;
  messageFeedbackSubmitted?: Set<string>;
  showTimestamps?: boolean;
};

// Converts bare URLs and email addresses in plain-text content to markdown links
// so react-markdown renders them as clickable anchors.
function linkifyText(text: string): string {
  // 1. Email addresses → mailto links (skip if already inside a markdown link)
  text = text.replace(
    /(?<![@\w])([\w._%+\-]+@[\w.\-]+\.[a-zA-Z]{2,})(?![\w@])/g,
    (_m, addr) => `[${addr}](mailto:${addr})`
  );
  // 2. Bare domain.tld[/path] patterns (no http:// prefix) → https:// links.
  //    Negative lookbehind skips email domains (@), URL path segments (/), and
  //    word-character prefixes to avoid false positives.
  text = text.replace(
    /(?<![@\/\w])((?:[a-zA-Z0-9](?:[a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?\.)+(?:tech|com|org|net|io|dev|app|ai|co|uk|de|fr|es|nl|se|no|pl|pt|it|be|au|ca)(?:\/[^\s<>"')\]\[`]*)?)(?![.\w])/g,
    (match) => `[${match}](https://${match})`
  );
  return text;
}

export default function MessageBubble({ message, widgetConfig, agentName, showMessageAvatars = true, textColor = '#111', agentBubbleBg = 'rgba(0,0,0,0.07)', fontStyles = {}, messageBubbleRadius = 8, onSubmitMessageFeedback, messageFeedbackSubmitted = new Set(), showTimestamps = true }: Props) {
  const { locale } = useWidgetTranslation();
  // Theme-aware neutrals derived from the configured text color so secondary
  // text, hairlines and code surfaces adapt to dark/branded themes instead of
  // hardcoded grays.
  const mutedTextColor = withAlpha(textColor, 0.6);
  const subtleBorderColor = withAlpha(textColor, 0.12);
  const codeBg = withAlpha(textColor, 0.08);
  const hasFeedback = messageFeedbackSubmitted.has(message.id);
  const safetyAction = message.metadata?.safety_policy_action || '';
  const showSafetyFallback = message.from === 'agent' && /fallback|forbidden_topic_block|escalation_handoff/.test(safetyAction);

  const [copied, setCopied] = useState(false);
  const [ReactMarkdown, setReactMarkdown] = useState<React.ComponentType<any> | null>(() => {
    try {
      // @ts-ignore - require is available in Jest/Node environments
      const rmMod = require('react-markdown');
      return (rmMod && (rmMod.default || rmMod)) || null;
    } catch {
      return null;
    }
  });
  const [remarkGfm, setRemarkGfm] = useState<any>(() => {
    try {
      // @ts-ignore - require is available in Jest/Node environments
      const gfmMod = require('remark-gfm');
      return (gfmMod && (gfmMod.default || gfmMod)) || null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    if (ReactMarkdown) return;

    let mounted = true;

    Promise.all([
      import('react-markdown').then(m => m.default || m).catch(() => null),
      import('remark-gfm').then(m => m.default || m).catch(() => null),
    ]).then(([RM, gfm]) => {
      if (mounted) {
        // React state setters treat functions as updaters, so wrap imported
        // function values to store them as state instead of invoking them.
        setReactMarkdown(() => RM as any);
        setRemarkGfm(() => gfm);
      }
    });
    return () => { mounted = false; };
  }, [ReactMarkdown]);
  // Two-pass citation processing:
  // Pass 1: "Source Title[n]" → "[Source Title](url)" — phrase becomes the link.
  // Pass 2: bare [n] → "[n](url)" numeric superscript fallback.
  const processedText = useMemo(() => {
    const srcs = message.sources;
    if (!srcs || srcs.length === 0) return linkifyText(message.text);
    try {
      let result = message.text;

      // Pass 1: make the cited phrase itself a link when the LLM writes it inline.
      // Try the full title first, then each segment split on common separators (-, :, |, /)
      // so partial references like "Getting Started Guide[1]" match a title like
      // "Product Documentation - Getting Started Guide".
      srcs.forEach((src, i) => {
        if (!src?.title) return;
        const n = i + 1;
        const rawTitle = src.title.replace(/[\r\n\t]+/g, ' ').trim();
        const safeTitle = rawTitle.substring(0, 120).replace(/"/g, '\\"');

        // Candidates: full title + each segment after splitting on separator chars.
        const candidates: string[] = [rawTitle];
        rawTitle.split(/\s*[-\u2013\u2014:|/]\s*/).forEach(part => {
          const clean = part.trim();
          if (clean.length >= 4) candidates.push(clean);
        });

        for (const phrase of candidates) {
          const phraseRegex = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const re = new RegExp(`(${phraseRegex})\\s*\\[${n}\\]`, 'g');
          // Also match reference-style markdown: [phrase][n] (LLM sometimes wraps in brackets)
          const reRef = new RegExp(`\\[${phraseRegex}\\]\\s*\\[${n}\\]`, 'g');
          const link = src.url
            ? `[${phrase}](${src.url} "${safeTitle}")`
            : `[${phrase}](#fn-${n} "${safeTitle}")`;
          if (re.test(result)) {
            result = result.replace(new RegExp(`(${phraseRegex})\\s*\\[${n}\\]`, 'g'), link);
            break;
          } else if (reRef.test(result)) {
            result = result.replace(new RegExp(`\\[${phraseRegex}\\]\\s*\\[${n}\\]`, 'g'), link);
            break;
          }
        }
      });

      // Pass 2: remaining bare [n] → numeric superscript link.
      result = result.replace(/\[(\d+)\]/g, (match, p1) => {
        const idx = Number(p1) - 1;
        if (!Number.isFinite(idx) || idx < 0) return match;
        const src = srcs[idx];
        if (!src) return match;
        const rawTitle = (src.title || '').replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim().substring(0, 120);
        const esc = rawTitle.replace(/"/g, '\\"');
        if (src.url) return `[${p1}](${src.url} "${esc}")`;
        return `[${p1}](#fn-${p1} "${esc}")`;
      });

      // If we've injected any markdown links already (e.g. from citation processing),
      // avoid running `linkifyText` over the full string as it may rewrite URLs
      // that are already inside markdown link parentheses and produce nested/malformed
      // links. Only linkify when no markdown links are present.
      const hasMarkdownLink = /\[[^\]]+\]\([^\)]+\)/.test(result);
      return hasMarkdownLink ? result : linkifyText(result);
    } catch {
      return linkifyText(message.text);
    }
  }, [message.text, message.sources]);

  const handleCopy = useCallback(() => {
    if (!message.text) return;
    try {
      navigator.clipboard.writeText(message.text).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }).catch(() => {
        // Fallback for browsers without clipboard API
        const textarea = document.createElement('textarea');
        textarea.value = message.text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        try { document.execCommand('copy'); } catch {}
        document.body.removeChild(textarea);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    } catch {
      // ignore
    }
  }, [message.text]);

  if (message.from === 'agent') {
    return (
      <div className={`flex w-full justify-start`}>
        <div className="flex flex-col items-start w-full">
          <div className="flex items-start gap-2">
              {showMessageAvatars && widgetConfig?.bot_avatar && (
              <img src={widgetConfig.bot_avatar} alt={(agentName || widgetConfig?.title?.en || 'agent') + ' avatar'} className="w-8 h-8 rounded-full object-cover shrink-0" />
            )}
            <div className={`max-w-[80%] px-3.5 py-2.5 border group relative`} style={{ backgroundColor: agentBubbleBg, borderColor: subtleBorderColor, color: textColor, borderRadius: `${messageBubbleRadius}px`, ...fontStyles }}>
              {/* Copy button — appears on hover */}
              <button
                type="button"
                onClick={handleCopy}
                title={copied ? translate(locale, 'copied') : translate(locale, 'copyMessage')}
                aria-label={copied ? translate(locale, 'copied') : translate(locale, 'copyMessage')}
                className="absolute top-1 right-1 opacity-40 hover:opacity-100 transition-opacity p-1 rounded focus:outline-none focus-visible:ring-2"
                style={{ color: textColor, backgroundColor: 'transparent', ['--tw-ring-color' as string]: withAlpha(textColor, 0.4) }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = withAlpha(textColor, 0.1); }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
              >
                {copied ? (
                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : (
                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
                    <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
                  </svg>
                )}
              </button>
              {/* Markdown-rendered message body */}
              <div className="prose prose-sm max-w-none pr-5 overflow-visible" style={{ color: textColor }}>
                {ReactMarkdown ? (
                  <ReactMarkdown
                    remarkPlugins={remarkGfm ? [remarkGfm] : []}
                    components={({
                      // Citation-aware link renderer: numeric link text = citation token
                      a: (({ href, title, children }: { href?: string; title?: string; children?: React.ReactNode }) => {
                        const linkText =
                          typeof children === 'string'
                            ? children
                            : Array.isArray(children) && children.length === 1 && typeof children[0] === 'string'
                              ? children[0]
                              : null;
                        const isCitation = linkText !== null && /^\d+$/.test(linkText);
                        // #fn-* anchors are non-URL citation badges — never render as a navigable link.
                        if (href && href.startsWith('#fn-')) {
                          const isNumericBadge = linkText !== null && /^\d+$/.test(linkText);
                          if (isNumericBadge) {
                            return <sup title={title || undefined} style={{ marginLeft: '1px', cursor: 'help', fontWeight: 600, fontSize: '0.72em', color: textColor, opacity: 0.75 }}>[{linkText}]</sup>;
                          }
                          // Full-phrase citation (file/Q&A source with no URL) — do not render the full
                          // title inline to avoid showing standalone source titles in the UI/tests.
                          // Citations should appear as numeric badges or remain as part of the
                          // original message text; do not output a separate visible span here.
                          return null;
                        }
                        if (isCitation) {
                          if (href && !href.startsWith('#fn-')) {
                            return (
                              <sup style={{ marginLeft: '1px' }}>
                                <a href={href} title={title} target="_blank" rel="noopener noreferrer" style={{ color: textColor, textDecoration: 'underline', fontWeight: 600, fontSize: '0.72em' }}>[{linkText}]</a>
                              </sup>
                            );
                          }
                          return <sup title={title || undefined} style={{ marginLeft: '1px', cursor: 'help', fontWeight: 600, fontSize: '0.72em', color: textColor, opacity: 0.75 }}>[{linkText}]</sup>;
                        }
                        return <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: textColor, textDecoration: 'underline' }}>{children}</a>;
                      }),
                      // Code: inline vs block
                      code: (({ className, children }: { className?: string; children?: React.ReactNode }) => {
                        const isBlock = /language-/.test(className || '');
                        return isBlock ? (
                          <pre style={{ backgroundColor: codeBg, borderRadius: '4px', padding: '8px', overflowX: 'auto', fontSize: '0.82em', margin: '4px 0' }}>
                            <code className={className}>{children}</code>
                          </pre>
                        ) : (
                          <code style={{ backgroundColor: codeBg, borderRadius: '3px', padding: '1px 4px', fontSize: '0.85em' }}>{children}</code>
                        );
                      }),
                      ul: (({ children }: { children?: React.ReactNode }) => <ul style={{ paddingInlineStart: '1.2em', margin: '4px 0', listStyleType: 'disc' }}>{children}</ul>),
                      ol: (({ children }: { children?: React.ReactNode }) => <ol style={{ paddingInlineStart: '1.2em', margin: '4px 0', listStyleType: 'decimal' }}>{children}</ol>),
                      li: (({ children }: { children?: React.ReactNode }) => <li style={{ margin: '2px 0' }}>{children}</li>),
                      p: (({ children }: { children?: React.ReactNode }) => <p style={{ margin: '2px 0' }}>{children}</p>),
                      h1: (({ children }: { children?: React.ReactNode }) => <h1 style={{ fontSize: '1.1em', fontWeight: 700, margin: '6px 0 2px' }}>{children}</h1>),
                      h2: (({ children }: { children?: React.ReactNode }) => <h2 style={{ fontSize: '1.05em', fontWeight: 700, margin: '6px 0 2px' }}>{children}</h2>),
                      h3: (({ children }: { children?: React.ReactNode }) => <h3 style={{ fontSize: '1em', fontWeight: 600, margin: '4px 0 2px' }}>{children}</h3>),
                      h4: (({ children }: { children?: React.ReactNode }) => <h4 style={{ fontSize: '0.95em', fontWeight: 600, margin: '4px 0 2px' }}>{children}</h4>),
                      h5: (({ children }: { children?: React.ReactNode }) => <h5 style={{ fontSize: '0.9em', fontWeight: 600, margin: '4px 0 2px' }}>{children}</h5>),
                      h6: (({ children }: { children?: React.ReactNode }) => <h6 style={{ fontSize: '0.85em', fontWeight: 600, margin: '4px 0 2px' }}>{children}</h6>),
                      hr: (() => <hr style={{ border: 'none', borderTop: `1px solid ${subtleBorderColor}`, margin: '6px 0' }} />),
                      blockquote: (({ children }: { children?: React.ReactNode }) => <blockquote style={{ borderInlineStart: `3px solid ${withAlpha(textColor, 0.2)}`, paddingInlineStart: '8px', margin: '4px 0', opacity: 0.85 }}>{children}</blockquote>),
                      strong: (({ children }: { children?: React.ReactNode }) => <strong style={{ fontWeight: 700 }}>{children}</strong>),
                      em: (({ children }: { children?: React.ReactNode }) => <em style={{ fontStyle: 'italic' }}>{children}</em>),
                    } as MDComponents)}
                  >
                    {processedText}
                  </ReactMarkdown>
                ) : (
                  <div style={{ whiteSpace: 'pre-wrap' }}>{processedText}</div>
                )}
              </div>

              {/* Sources panel intentionally omitted — citations are inline */}
            </div>
          </div>
          {!hasFeedback && onSubmitMessageFeedback && (
            <div className="mt-1 flex gap-2" style={{ marginInlineStart: (showMessageAvatars && widgetConfig?.bot_avatar) ? '40px' : '0' }}>
              <button type="button" onClick={() => onSubmitMessageFeedback(message.id, 'thumbs_up')} className="text-xs opacity-50 hover:opacity-100 transition-opacity flex items-center gap-1 rounded p-0.5 focus:outline-none focus-visible:ring-2" style={{ color: textColor, ['--tw-ring-color' as string]: withAlpha(textColor, 0.4) }} title={translate(locale, 'feedbackThumbsUp')} aria-label={translate(locale, 'feedbackPositive')}>
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5" /></svg>
              </button>
              <button type="button" onClick={() => onSubmitMessageFeedback(message.id, 'thumbs_down')} className="text-xs opacity-50 hover:opacity-100 transition-opacity flex items-center gap-1 rounded p-0.5 focus:outline-none focus-visible:ring-2" style={{ color: textColor, ['--tw-ring-color' as string]: withAlpha(textColor, 0.4) }} title={translate(locale, 'feedbackThumbsDown')} aria-label={translate(locale, 'feedbackNegative')}>
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14H5.236a2 2 0 01-1.789-2.894l3.5-7A2 2 0 018.737 3h4.017c.163 0 .326.02.485.06L17 4m-7 10v5a2 2 0 002 2h.095c.5 0 .905-.405.905-.905 0-.714.211-1.412.608-2.006L17 13V4m-7 10h2m6-10h-2" /></svg>
              </button>
            </div>
          )}
          {showSafetyFallback && (
            <span
              className="mt-1 text-xs"
              style={{
                marginInlineStart: (showMessageAvatars && widgetConfig?.bot_avatar) ? '40px' : '0',
                color: STATUS_COLORS.safety.text,
                backgroundColor: STATUS_COLORS.safety.bg,
                border: `1px solid ${STATUS_COLORS.safety.border}`,
                borderRadius: '999px',
                padding: '2px 8px',
              }}
              title={message.metadata?.safety_decision_reason || translate(locale, 'safetyPolicyApplied')}
            >
              {translate(locale, 'safetyFallback')}
            </span>
          )}
          {hasFeedback && (
            <span className="mt-1 text-xs opacity-50" style={{ color: textColor, marginInlineStart: (showMessageAvatars && widgetConfig?.bot_avatar) ? '40px' : '0' }}>{translate(locale, 'feedbackSubmitted')}</span>
          )}
          {showTimestamps && message.timestamp && (
            <span className="mt-1 text-xs" style={{ color: mutedTextColor, marginInlineStart: (showMessageAvatars && widgetConfig?.bot_avatar) ? '40px' : '0' }}>{new Date(message.timestamp).toLocaleTimeString()}</span>
          )}
        </div>
      </div>
    );
  }

  // user message
  const isPending = Boolean(message.pending);
  const attempts = (message as any).attempts || 0;

  const userBubbleBg = normalizeHexColor(widgetConfig?.primary_color, '#111827');

  const bubbleStyle: React.CSSProperties = isPending
    ? {
        backgroundColor: 'transparent',
        color: mutedTextColor,
        borderRadius: `${messageBubbleRadius}px`,
        border: `1px dashed ${subtleBorderColor}`,
        opacity: 0.9,
        ...fontStyles,
      }
    : {
        backgroundColor: userBubbleBg,
        // Contrast-aware text so a light primary_color (e.g. yellow) stays
        // readable instead of hardcoded white-on-light. (#10)
        color: getReadableTextColor(userBubbleBg),
        borderRadius: `${messageBubbleRadius}px`,
        ...fontStyles,
      };

  return (
    <div className={`flex w-full justify-end`}>
      <div className="flex flex-col items-end w-full" aria-live={isPending ? 'polite' : undefined}>
        <div className={`max-w-[80%] px-3.5 py-2.5`} style={bubbleStyle} data-pending={isPending ? 'true' : 'false'}>
          <div style={{ opacity: isPending ? 0.9 : 1 }}>{message.text}</div>
        </div>

        {isPending && (
          <div className="mt-1 flex items-center gap-3">
            {attempts === 0 && (
              <span className="text-xs opacity-70 flex items-center gap-1" style={{ color: mutedTextColor }}>
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>
                <span className="text-xs">{translate(locale, 'offlineStatus')}</span>
              </span>
            )}

            {attempts > 0 && attempts < 3 && (
              <span className="text-xs opacity-70 flex items-center gap-1" style={{ color: mutedTextColor }}>
                <svg className="animate-spin w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /></svg>
                <span className="text-xs">{translate(locale, 'deliveringStatus', { vars: { attempt: attempts } })}</span>
              </span>
            )}

            {attempts >= 3 && (
              <div className="flex items-center gap-2">
                <span className="text-xs opacity-70" style={{ color: STATUS_COLORS.danger }}>{translate(locale, 'failedSend')}</span>
                <button type="button" className="text-xs underline" onClick={() => {
                  try {
                    window.dispatchEvent(new CustomEvent('companin:retry-queued', { detail: { id: message.id } }));
                  } catch {}
                }}>{translate(locale, 'retry')}</button>
              </div>
            )}
          </div>
        )}

        {showTimestamps && message.timestamp && (
          <span className="mt-1 text-xs" style={{ color: mutedTextColor }}>{new Date(message.timestamp).toLocaleTimeString()}</span>
        )}
      </div>
    </div>
  );
}
