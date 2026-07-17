import { ChatToolCalls } from '@seta/shared-ui';
import { payloadDetail } from './payload-detail';

export interface WhoAmIProps {
  name: string;
  args: Record<string, unknown>;
  state: 'input-streaming' | 'output-available' | 'output-error';
  output?: { display_name?: string; email?: string };
}

export function WhoAmIRenderer({ name, state, output }: WhoAmIProps) {
  if (state === 'output-available') {
    return (
      <ChatToolCalls
        calls={[
          {
            name,
            status: 'complete',
            target: output?.display_name ?? output?.email ?? 'profile loaded',
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
