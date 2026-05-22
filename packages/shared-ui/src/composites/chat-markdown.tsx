import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '../lib/cn';

export interface ChatMarkdownProps {
  text: string;
  className?: string;
}

const COMPONENTS: Components = {
  p: ({ children }) => <p className="my-xs first:mt-0 last:mb-0">{children}</p>,
  ul: ({ children }) => (
    <ul className="my-xs list-disc space-y-1 pl-5 first:mt-0 last:mb-0">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="my-xs list-decimal space-y-1 pl-5 first:mt-0 last:mb-0">{children}</ol>
  ),
  li: ({ children }) => <li className="leading-snug">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold text-ink">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary"
    >
      {children}
    </a>
  ),
  code: ({ className, children }) => {
    const isInline = !className?.startsWith('language-');
    if (isInline) {
      return (
        <code className="rounded bg-surface-2 px-1 py-px font-mono text-[0.92em] text-ink">
          {children}
        </code>
      );
    }
    return <code className={className}>{children}</code>;
  },
  pre: ({ children }) => (
    <pre className="my-xs overflow-auto rounded-md border border-hairline bg-surface-2 p-3 font-mono text-caption text-ink first:mt-0 last:mb-0">
      {children}
    </pre>
  ),
  blockquote: ({ children }) => (
    <blockquote className="my-xs border-l-2 border-hairline pl-3 text-ink-muted first:mt-0 last:mb-0">
      {children}
    </blockquote>
  ),
  h1: ({ children }) => <h1 className="mb-xs mt-md text-section-title text-ink">{children}</h1>,
  h2: ({ children }) => <h2 className="mb-xs mt-md text-section-title text-ink">{children}</h2>,
  h3: ({ children }) => (
    <h3 className="mb-xs mt-md text-body-sm font-semibold text-ink">{children}</h3>
  ),
  hr: () => <hr className="my-md border-hairline" />,
  table: ({ children }) => (
    <div className="my-xs overflow-auto first:mt-0 last:mb-0">
      <table className="w-full border-collapse text-body-sm">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border-b border-hairline px-2 py-1 text-left font-semibold text-ink">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border-b border-hairline px-2 py-1 align-top">{children}</td>
  ),
};

export function ChatMarkdown({ text, className }: ChatMarkdownProps) {
  return (
    <div className={cn('text-body-sm leading-[1.55] text-ink', className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={COMPONENTS}>
        {text}
      </ReactMarkdown>
    </div>
  );
}
