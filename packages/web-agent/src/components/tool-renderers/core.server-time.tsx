import { ChatToolCalls } from '@seta/shared-ui';
import { payloadDetail } from './payload-detail';

export interface ServerTimeProps {
  name: string;
  args: Record<string, unknown>;
  state: 'input-streaming' | 'output-available' | 'output-error';
  output?: { iso?: string };
}

export function ServerTimeRenderer({ name, state, output }: ServerTimeProps) {
  if (state === 'output-available') {
    return (
      <ChatToolCalls
        calls={[
          {
            name,
            status: 'complete',
            target: output?.iso ?? 'now',
            resultDetail: payloadDetail(output),
          },
        ]}
      />
    );
  }
  if (state === 'output-error') {
    return <ChatToolCalls calls={[{ name, status: 'error', errorMessage: 'failed' }]} />;
  }
  return <ChatToolCalls calls={[{ name, status: 'running' }]} />;
}
