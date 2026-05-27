import { ChatToolCall } from '@seta/shared-ui';

export interface ServerTimeProps {
  name: string;
  args: Record<string, unknown>;
  state: 'input-streaming' | 'output-available' | 'output-error';
  output?: { iso?: string };
}

export function ServerTimeRenderer({ name, state, output }: ServerTimeProps) {
  if (state === 'output-available') {
    return <ChatToolCall name={name} status="ok" summary={output?.iso ?? 'now'} payload={output} />;
  }
  if (state === 'output-error') return <ChatToolCall name={name} status="error" summary="failed" />;
  return <ChatToolCall name={name} status="running" />;
}
