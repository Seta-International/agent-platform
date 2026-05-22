import { randomUUID } from 'node:crypto';
import type { Transport, TransportSendInput, TransportSendResult } from './types.ts';

export interface DevStubTransport extends Transport {
  readonly kind: 'dev-stub';
  readonly sent: TransportSendInput[];
  reset(): void;
}

export function createDevStubTransport(): DevStubTransport {
  const sent: TransportSendInput[] = [];
  return {
    kind: 'dev-stub',
    sent,
    async send(input: TransportSendInput): Promise<TransportSendResult> {
      sent.push(input);
      return { messageId: `dev-stub:${randomUUID()}` };
    },
    reset() {
      sent.length = 0;
    },
  };
}
