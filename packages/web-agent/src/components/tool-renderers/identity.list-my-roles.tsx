import { ChatToolCalls } from '@seta/shared-ui';
import { payloadDetail } from './payload-detail';

export interface ListMyRolesProps {
  name: string;
  args: Record<string, unknown>;
  state: 'input-streaming' | 'output-available' | 'output-error';
  output?: { roles?: Array<{ slug: string }>; permissions?: string[] };
}

export function ListMyRolesRenderer({ name, state, output }: ListMyRolesProps) {
  if (state === 'output-available') {
    const roleCount = output?.roles?.length ?? 0;
    const permCount = output?.permissions?.length ?? 0;
    return (
      <ChatToolCalls
        calls={[
          {
            name,
            status: 'complete',
            target: `${roleCount} roles, ${permCount} permissions`,
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
