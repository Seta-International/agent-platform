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
  readonly kind: TransportKind;
  readonly classification: 'permanent' | 'transient';
  readonly code: string;
  readonly cause?: unknown;
  constructor(
    kind: TransportKind,
    classification: 'permanent' | 'transient',
    code: string,
    message: string,
    cause?: unknown,
  ) {
    super(message);
    this.kind = kind;
    this.classification = classification;
    this.code = code;
    this.cause = cause;
    this.name = 'TransportError';
  }
}
