import DOMPurifyFactory from 'dompurify';
import ReactMarkdown from 'react-markdown';

import { cn } from '../lib/cn';

// Bind DOMPurify to the current window so it works in both browser and
// happy-dom / jsdom test environments where a global window is available.
const DOMPurify = typeof window !== 'undefined' ? DOMPurifyFactory(window) : DOMPurifyFactory;

/**
 * Tags whose content must be fully removed (not kept as text), per the
 * OWASP XSS prevention cheatsheet. We pre-strip these via DOM manipulation
 * before handing the string to DOMPurify because some DOM implementations
 * (happy-dom, older jsdom) skip these elements in their NodeIterator
 * traversal, causing DOMPurify to miss them.
 */
const DANGEROUS_TAGS = ['script', 'style', 'iframe', 'object', 'embed', 'noscript'];

/**
 * Sanitize an HTML string:
 * 1. Pre-strip dangerous tags via DOM manipulation (reliable in all environments).
 * 2. Run DOMPurify for attribute / event-handler sanitization.
 */
function sanitizeHtml(html: string): string {
  if (typeof document === 'undefined') return '';

  const container = document.createElement('div');
  container.innerHTML = html;

  for (const tag of DANGEROUS_TAGS) {
    for (const el of Array.from(container.querySelectorAll(tag))) {
      el.parentNode?.removeChild(el);
    }
  }

  return DOMPurify.sanitize(container.innerHTML);
}

interface Props {
  value: string | null | undefined;
  className?: string;
}

const isHtml = (s: string) => /<\/[a-z][a-z0-9]*>/i.test(s);

export function RichTextDisplay({ value, className }: Props) {
  if (!value) return null;

  if (isHtml(value)) {
    const safe = sanitizeHtml(value);
    return (
      <div
        data-rich-text="html"
        className={cn('rich-text text-body-sm text-ink', className)}
        // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized by DOMPurify
        dangerouslySetInnerHTML={{ __html: safe }}
      />
    );
  }

  return (
    <div className={className}>
      <ReactMarkdown>{value}</ReactMarkdown>
    </div>
  );
}
