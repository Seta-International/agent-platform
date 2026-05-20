export {
  type DisableMailTransportConfigArgs,
  disableMailTransportConfig,
} from './backend/domain/disable-mail-transport-config.ts';
export {
  type Actor as IntegrationsActor,
  getMailTransportConfig,
} from './backend/domain/get-mail-transport-config.ts';
export {
  type CreateMailTransportConfigStoreDeps,
  createMailTransportConfigStore,
  type GraphTransportConfig,
  type MailTransportConfigRow,
  type MailTransportConfigStore,
  type SmtpTransportConfigEncrypted,
  type UpsertMailTransportConfigInput,
} from './backend/domain/mail-transport-config-store.ts';
export {
  type SetMailTransportConfigArgs,
  type SetMailTransportConfigInput,
  setMailTransportConfig,
} from './backend/domain/set-mail-transport-config.ts';
export {
  type VerifyMailTransportArgs,
  type VerifyMailTransportResult,
  verifyMailTransport,
} from './backend/domain/verify-mail-transport.ts';
export {
  INTEGRATIONS_PERMISSIONS,
  IntegrationsError,
  type IntegrationsPermission,
} from './backend/rbac.ts';
export type { TransportConfigKind, TransportConfigPayload } from './db/schema/index.ts';
export type { IntegrationsEvent } from './events/index.ts';
