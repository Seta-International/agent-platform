import { ChatMarkdown } from '../chat-markdown';
import type { BlockProps } from './types';

export function MarkdownBlock({ block }: BlockProps) {
  const body = typeof block.body === 'string' ? block.body : '';
  return <ChatMarkdown text={body} />;
}
