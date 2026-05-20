export { type MailerEnv, parseMailerEnv } from './env.ts';
export {
  type CreateMailerDeps,
  createMailer,
  type EmitDomainEvent,
  type OutboxStoreLike,
  type QueueHandle,
} from './mailer.ts';
export { listTemplates, type RenderedTemplate, renderTemplate } from './render.ts';
export {
  type ResolvedTransport,
  type ResolveTransportConfigRow,
  type ResolveTransportDeps,
  resolveTransport,
} from './resolve-transport.ts';
export type {
  Transport,
  TransportSendInput,
  TransportSendResult,
} from './transports/types.ts';
export { TransportError } from './transports/types.ts';
export * from './types.ts';
