export {
  type DisableMailTransportConfigArgs,
  disableMailTransportConfig,
} from './backend/domain/disable-mail-transport-config.ts';
export {
  type DecryptedM365TenantConfig,
  getM365TenantConfig,
} from './backend/domain/get-m365-tenant-config.ts';
export {
  type Actor as IntegrationsActor,
  getMailTransportConfig,
} from './backend/domain/get-mail-transport-config.ts';
export {
  type CreateM365TenantConfigStoreDeps,
  createM365TenantConfigStore,
  type M365TenantConfigRow,
  type M365TenantConfigStore,
  type UpsertM365TenantConfigInput,
} from './backend/domain/m365-tenant-config-store.ts';
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
  type SetM365TenantConfigArgs,
  type SetM365TenantConfigInput,
  setM365TenantConfig,
} from './backend/domain/set-m365-tenant-config.ts';
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
  requirePermission as requireIntegrationsPermission,
} from './backend/rbac.ts';
export type { TransportConfigKind, TransportConfigPayload } from './db/schema/index.ts';
export type { IntegrationsEvent } from './events/index.ts';
export * as m365 from './m365/index.ts';
export {
  INTEGRATIONS_PERMISSIONS as INTEGRATIONS_PERMISSION_SLUGS,
  INTEGRATIONS_ROLE_PERMISSIONS,
  INTEGRATIONS_ROLE_SLUGS,
  type IntegrationsRoleSlug,
} from './rbac.ts';
