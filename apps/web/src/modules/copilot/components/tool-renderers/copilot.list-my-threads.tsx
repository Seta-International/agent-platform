import { ChatToolCall } from '@seta/shared-ui';

export interface ListMyThreadsProps {
  name: string;
  args: Record<string, unknown>;
  state: 'input-streaming' | 'output-available' | 'output-error';
  output?: { threads?: unknown[] };
}

export function ListMyThreadsRenderer({ name, state, output }: ListMyThreadsProps) {
  if (state === 'output-available') {
    return (
      <ChatToolCall
        name={name}
        status="ok"
        summary={`${output?.threads?.length ?? 0} threads`}
        payload={output}
      />
    );
  }
  if (state === 'output-error') return <ChatToolCall name={name} status="error" summary="failed" />;
  return <ChatToolCall name={name} status="running" />;
}
