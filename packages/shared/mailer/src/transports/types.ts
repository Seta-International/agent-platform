export type TransportKind = 'graph' | 'smtp' | 'dev-stub';

export interface TransportSendInput {
  from: string;
  fromDisplayName?: string;
  to: string;
  replyTo?: string;
  subject: string;
  html: string;
  text: string;
}

export interface TransportSendResult {
  messageId: string | null;
}

export interface Transport {
  readonly kind: TransportKind;
  send(input: TransportSendInput): Promise<TransportSendResult>;
}

export class TransportError extends Error {
  constructor(
    public readonly kind: TransportKind,
    public readonly classification: 'permanent' | 'transient',
    public readonly code: string,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'TransportError';
  }
}
