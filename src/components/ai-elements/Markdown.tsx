"use client";

import React, { useMemo } from "react";

const resolveCjsEsm = (mod: any) => mod?.default ?? mod;
const ReactMarkdown: any =
  typeof require !== 'undefined' ? resolveCjsEsm(require("react-markdown")) : (null as any);
const remarkGfm: any =
  typeof require !== 'undefined' ? resolveCjsEsm(require("remark-gfm")) : (null as any);

type SourceItem = { url?: string; title?: string; snippet?: string };

type Props = {
  content: string;
  sources?: Array<SourceItem>;
};

export default function Markdown({ content, sources }: Props) {

  /**
   * Pre-process [n] citation tokens into markdown links.
   * URL sources  → [n](url "tooltip")   → rendered as superscript link by `a` component.
   * Non-URL      → [n](#fn-n "tooltip") → rendered as superscript badge by `a` component.
   */
  const processed = useMemo(() => {
    if (!sources || sources.length === 0) return content;
    try {
      let result = content;

      // Pass 1: make the cited phrase itself a link when the LLM writes it inline.
      // Try the full title first, then each segment split on common separators (-, :, |, /)
      // so partial references like "Getting Started Guide[1]" match a title like
      // "Product Documentation - Getting Started Guide".
      sources.forEach((src, i) => {
        if (!src?.title) return;
        const n = i + 1;
        const rawTitle = src.title.replace(/[\r\n\t]+/g, ' ').trim();
        const safeTitle = rawTitle.substring(0, 120).replace(/"/g, '\\"');

        // Candidates: full title + each part after splitting on separator chars.
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
            break; // stop at the first (longest) match
          } else if (reRef.test(result)) {
            result = result.replace(new RegExp(`\\[${phraseRegex}\\]\\s*\\[${n}\\]`, 'g'), link);
            break;
          }
        }
      });

      // Pass 2: Replace any remaining bare [n] tokens with a numeric superscript link.
      result = result.replace(/\[(\d+)\]/g, (match, p1) => {
        const idx = Number(p1) - 1;
        if (!Number.isFinite(idx) || idx < 0) return match;
        const src = sources[idx];
        if (!src) return match;
        const rawTitle = (src.title || '').replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim().substring(0, 120);
        const esc = rawTitle.replace(/"/g, '\\"');
        if (src.url) return `[${p1}](${src.url} "${esc}")`;
        return `[${p1}](#fn-${p1} "${esc}")`;
      });

      return result;
    } catch {
      return content;
    }
  }, [content, sources]);


  /**
   * Custom `a` renderer: a link whose text is a bare number is a citation token.
   *   External URL → <sup><a href target="_blank">[n]</a></sup>
   *   #fn- anchor  → <sup title>[n]</sup>  (non-URL source badge)
   * All other links are normal external links.
   */
  const components = useMemo((): Record<string, React.ComponentType<any>> => ({
    a: ({ href, title, children }: { href?: string; title?: string; children?: React.ReactNode }) => {
      const linkText =
        typeof children === 'string'
          ? children
          : Array.isArray(children) && children.length === 1 && typeof children[0] === 'string'
            ? children[0]
            : null;
      const isCitation = linkText !== null && /^\d+$/.test(linkText);

      // #fn-* anchors are non-URL citation badges — never navigate.
      if (href && href.startsWith('#fn-')) {
        const isNumericBadge = linkText !== null && /^\d+$/.test(linkText);
        if (isNumericBadge) {
          return (
            <sup title={title || undefined} style={{ marginLeft: '1px', cursor: 'help', fontWeight: 600, fontSize: '0.72em', opacity: 0.75 }}>
              [{linkText}]
            </sup>
          );
        }
        // Full-phrase citation (file/Q&A source with no URL) — render as dotted-underline reference
        return (
          <span title={title || undefined} style={{ borderBottom: '1px dotted currentColor', cursor: 'help', opacity: 0.85 }}>
            {children}
          </span>
        );
      }

      if (isCitation) {
        if (href && !href.startsWith('#fn-')) {
          return (
            <sup style={{ marginLeft: '1px' }}>
              <a
                href={href}
                title={title || undefined}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: 'inherit', textDecoration: 'underline', fontWeight: 600, fontSize: '0.72em' }}
              >
                [{linkText}]
              </a>
            </sup>
          );
        }
        // Non-URL source: superscript badge with title tooltip
        return (
          <sup title={title || undefined} style={{ marginLeft: '1px', cursor: 'help', fontWeight: 600, fontSize: '0.72em', opacity: 0.75 }}>
            [{linkText}]
          </sup>
        );
      }

      return (
        <a href={href} target="_blank" rel="noopener noreferrer">
          {children}
        </a>
      );
    },
  }), []);

  return (
    <div className="prose max-w-full overflow-visible whitespace-pre-wrap">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {processed}
      </ReactMarkdown>
    </div>
  );
}

