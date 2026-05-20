export {
  type CreateMailTransportConfigStoreDeps,
  createMailTransportConfigStore,
  type GraphTransportConfig,
  type MailTransportConfigRow,
  type MailTransportConfigStore,
  type SmtpTransportConfigEncrypted,
  type UpsertMailTransportConfigInput,
} from './backend/domain/mail-transport-config-store.ts';
export type { TransportConfigKind, TransportConfigPayload } from './db/schema/index.ts';
export type { IntegrationsEvent } from './events/index.ts';
