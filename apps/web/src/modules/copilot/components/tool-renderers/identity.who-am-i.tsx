import { ChatToolCall } from '@seta/shared-ui';

export interface WhoAmIProps {
  name: string;
  args: Record<string, unknown>;
  state: 'input-streaming' | 'output-available' | 'output-error';
  output?: { display_name?: string; email?: string };
}

export function WhoAmIRenderer({ name, state, output }: WhoAmIProps) {
  if (state === 'output-available') {
    return (
      <ChatToolCall
        name={name}
        status="ok"
        summary={output?.display_name ?? output?.email ?? 'profile loaded'}
        payload={output}
      />
    );
  }
  if (state === 'output-error') return <ChatToolCall name={name} status="error" summary="failed" />;
  return <ChatToolCall name={name} status="running" />;
}
