export type { ChangeUserEmailInput } from './backend/domain/change-user-email.ts';
export { changeUserEmail } from './backend/domain/change-user-email.ts';
export type { Actor, CreateUserInput } from './backend/domain/create-user.ts';
export { createUser } from './backend/domain/create-user.ts';
export { deactivateUser } from './backend/domain/deactivate-user.ts';
export { disableSsoProvider } from './backend/domain/disable-sso-provider.ts';
export { disconnectSsoProvider } from './backend/domain/disconnect-sso-provider.ts';
export type { DiscoverResult } from './backend/domain/discover-provider.ts';
export { discoverProvider } from './backend/domain/discover-provider.ts';
export { enableSsoProvider } from './backend/domain/enable-sso-provider.ts';
export type { UserGrant } from './backend/domain/get-user-grants.ts';
export { getUserGrants } from './backend/domain/get-user-grants.ts';
export type { UserProfile } from './backend/domain/get-user-profile.ts';
export { getUserProfile } from './backend/domain/get-user-profile.ts';
export { getUserSignInMethods } from './backend/domain/get-user-sign-in-methods.ts';
export type { GrantRoleInput } from './backend/domain/grant-role.ts';
export { grantRole } from './backend/domain/grant-role.ts';
export type { ImportUsersFromEntraInput } from './backend/domain/import-users-from-entra.ts';
export { importUsersFromEntra } from './backend/domain/import-users-from-entra.ts';
export type {
  LinkOutcome,
  LinkSsoAccountInput,
  LinkSsoAccountResult,
} from './backend/domain/link-sso-account.ts';
export { linkSsoAccount } from './backend/domain/link-sso-account.ts';
export type { EntraImportableUser } from './backend/domain/list-entra-importable-users.ts';
export { listEntraImportableUsers } from './backend/domain/list-entra-importable-users.ts';
export { listMyEffectivePermissions } from './backend/domain/list-my-effective-permissions.ts';
export type { ActiveRoleGrant, RoleGrantsResult } from './backend/domain/list-role-grants.ts';
export { listRoleGrants } from './backend/domain/list-role-grants.ts';
export { listSsoProviders } from './backend/domain/list-sso-providers.ts';
export type {
  ActivityRole,
  ActivityRow,
  ListUserEventsInput,
} from './backend/domain/list-user-events.ts';
export { listUserEvents } from './backend/domain/list-user-events.ts';
export type {
  ListUserSessionsInput,
  SessionRow,
} from './backend/domain/list-user-sessions.ts';
export { listUserSessions } from './backend/domain/list-user-sessions.ts';
export type { AdminUserRow, ListUsersOpts } from './backend/domain/list-users.ts';
export { listUsers } from './backend/domain/list-users.ts';
export { reactivateUser } from './backend/domain/reactivate-user.ts';
export type { RecordSsoConsentInput } from './backend/domain/record-sso-consent.ts';
export { recordSsoConsent } from './backend/domain/record-sso-consent.ts';
export type { RegisterSsoProviderInput } from './backend/domain/register-sso-provider.ts';
export { registerSsoProvider } from './backend/domain/register-sso-provider.ts';
export type { ResetPasswordByAdminInput } from './backend/domain/reset-user-password-by-admin.ts';
export { resetUserPasswordByAdmin } from './backend/domain/reset-user-password-by-admin.ts';
export { revokeRole } from './backend/domain/revoke-role.ts';
export type { RevokeUserSessionInput } from './backend/domain/revoke-user-session.ts';
export { revokeUserSession } from './backend/domain/revoke-user-session.ts';
export { searchSkills } from './backend/domain/search-skills.ts';
export { setLocalPasswordDisabled } from './backend/domain/set-local-password-disabled.ts';
export type { UpdateMyDisplayNameInput } from './backend/domain/update-my-display-name.ts';
export { updateMyDisplayName } from './backend/domain/update-my-display-name.ts';
export type { UpdateUserProfilePatch } from './backend/domain/update-user-profile.ts';
export { updateUserProfile } from './backend/domain/update-user-profile.ts';
export { whoAmI } from './backend/domain/who-am-i.ts';
export { IdentityError } from './backend/rbac.ts';
export { buildAdminConsentUrl } from './backend/sso/consent-url.ts';
export type { ProviderRow as SsoProviderRow } from './backend/sso/helpers.ts';
export { requireProviderRow } from './backend/sso/helpers.ts';
export type { IdentityEvent } from './events/index.ts';
export type { TenantRoleSlug } from './roles.ts';
export { A2_PERMISSIONS, type A2Permission, TENANT_ROLE_SLUGS } from './roles.ts';
export type { MicrosoftEntraConfig, SsoProviderId } from './sso/config.ts';
