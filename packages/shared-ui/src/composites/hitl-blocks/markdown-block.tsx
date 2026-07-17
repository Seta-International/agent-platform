import { Markdown } from '../../primitives/markdown';
import type { BlockProps } from './types';

export function MarkdownBlock({ block }: BlockProps) {
  const body = typeof block.body === 'string' ? block.body : '';
  // `compact`: block bodies render inside a HITL card, so tight block spacing
  // is the closest match to the old ChatMarkdown's `my-xs` margins.
  // `autolink`: the old renderer ran remark-gfm, whose autolink-literal
  // extension is on by default; Astryx's is opt-in, so bare URLs in an
  // approval body would otherwise regress to plain text.
  return (
    <Markdown density="compact" autolink="gfm">
      {body}
    </Markdown>
  );
}
