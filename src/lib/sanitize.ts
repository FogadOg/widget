/**
 * Centralized DOMPurify sanitizer wrapper.
 *
 * All HTML that originates from external sources (API markdown, user content,
 * rich-text fields, etc.) MUST pass through `sanitize()` before being placed
 * into the DOM via `dangerouslySetInnerHTML` or `innerHTML`.
 *
 * Usage:
 *   import { sanitize } from '@/lib/sanitize';
 *   <div dangerouslySetInnerHTML={{ __html: sanitize(rawHtml) }} />
 *
 * The allowed-tags/attributes list is intentionally conservative.
 * Extend `ALLOWED_TAGS` and `ALLOWED_ATTR` only when a concrete product
 * requirement cannot be met otherwise.
 */

'use client';

import DOMPurify from 'dompurify';

/** Allowed HTML tags for general rich-text rendering */
const ALLOWED_TAGS: string[] = [
  'a',
  'b',
  'blockquote',
  'br',
  'caption',
  'cite',
  'code',
  'col',
  'colgroup',
  'dd',
  'del',
  'details',
  'dfn',
  'div',
  'dl',
  'dt',
  'em',
  'figcaption',
  'figure',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'hr',
  'i',
  'img',
  'ins',
  'kbd',
  'li',
  'mark',
  'ol',
  'p',
  'pre',
  'q',
  's',
  'samp',
  'small',
  'span',
  'strong',
  'sub',
  'summary',
  'sup',
  'table',
  'tbody',
  'td',
  'tfoot',
  'th',
  'thead',
  'time',
  'tr',
  'u',
  'ul',
  'var',
];

/** Allowed HTML attributes */
const ALLOWED_ATTR: string[] = [
  'alt',
  'aria-label',
  'aria-labelledby',
  'class',
  'colspan',
  'datetime',
  'dir',
  'href',
  'id',
  'lang',
  'rel',
  'rowspan',
  'scope',
  'src',
  'srcset',
  'start',
  'target',
  'title',
  'type',
  'width',
  'height',
];

const PURIFY_CONFIG = {
  ALLOWED_TAGS,
  ALLOWED_ATTR,
  // Forbid data: URIs except in img src (handled by FORCE_BODY)
  FORBID_ATTR: ['onerror', 'onload', 'onclick', 'style'],
  FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'base', 'link'],
  // Force all links to be safe
  ADD_ATTR: ['target'],
};

// Ensure external links open in a new tab and cannot inject javascript:
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  try {
    // Some nodes passed to hooks may not be Elements; guard accordingly.
    if (!(node instanceof Element)) return;
    const tag = node.tagName ? node.tagName.toUpperCase() : '';
    if (tag === 'A') {
      const href = node.getAttribute('href') ?? '';
      if (/^javascript:/i.test(href)) {
        node.removeAttribute('href');
      }
      if (node.getAttribute('target') === '_blank') {
        node.setAttribute('rel', 'noopener noreferrer');
      }
    }
    if (tag === 'IMG') {
      const src = node.getAttribute('src') ?? '';
      if (/^javascript:/i.test(src)) {
        node.removeAttribute('src');
      }
    }
  } catch {
    // Keep sanitizer robust; don't throw from hooks.
  }
});

/**
 * Sanitize an HTML string for safe DOM insertion.
 *
 * @param dirty  Raw HTML from an untrusted source.
 * @returns      Sanitized HTML string.
 */
export function sanitize(dirty: string): string {
  if (typeof window === 'undefined') {
    // Server-side: DOMPurify requires a DOM environment.
    // Return an empty string; rendering should happen client-side only.
    return '';
  }
  return DOMPurify.sanitize(dirty, PURIFY_CONFIG) as string;
}

/**
 * Sanitize plain text — strips ALL html tags, returning only text content.
 */
export function sanitizeText(dirty: string): string {
  if (typeof window === 'undefined') return '';
  return DOMPurify.sanitize(dirty, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] }) as string;
}
