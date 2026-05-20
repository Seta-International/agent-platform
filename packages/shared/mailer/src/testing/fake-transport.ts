import { randomUUID } from 'node:crypto';
import {
  type Transport,
  TransportError,
  type TransportSendInput,
  type TransportSendResult,
} from '../transports/types.ts';

export interface FakeTransportOptions {
  kind?: 'graph' | 'smtp' | 'dev-stub';
  fail?: 'permanent' | 'transient';
  failCode?: string;
}

export interface FakeTransport extends Transport {
  readonly sent: TransportSendInput[];
  reset(): void;
}

export function createFakeTransport(options: FakeTransportOptions = {}): FakeTransport {
  const sent: TransportSendInput[] = [];
  return {
    kind: options.kind ?? 'dev-stub',
    sent,
    async send(input: TransportSendInput): Promise<TransportSendResult> {
      if (options.fail) {
        throw new TransportError(
          options.kind ?? 'dev-stub',
          options.fail,
          options.failCode ?? 'FAKE',
          'fake failure',
        );
      }
      sent.push(input);
      return { messageId: `fake:${randomUUID()}` };
    },
    reset() {
      sent.length = 0;
    },
  };
}
