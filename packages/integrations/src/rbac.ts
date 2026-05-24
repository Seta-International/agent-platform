export const INTEGRATIONS_PERMISSIONS = [
  'integrations.mail.read',
  'integrations.mail.configure',
  'integrations.m365.read',
  'integrations.m365.config.write',
] as const;
export type IntegrationsPermission = (typeof INTEGRATIONS_PERMISSIONS)[number];

export const INTEGRATIONS_ROLE_SLUGS = ['integrations.admin', 'integrations.viewer'] as const;
export type IntegrationsRoleSlug = (typeof INTEGRATIONS_ROLE_SLUGS)[number];

export const INTEGRATIONS_ROLE_PERMISSIONS: Record<IntegrationsRoleSlug, IntegrationsPermission[]> =
  {
    'integrations.admin': [
      'integrations.mail.read',
      'integrations.mail.configure',
      'integrations.m365.read',
      'integrations.m365.config.write',
    ],
    'integrations.viewer': ['integrations.mail.read', 'integrations.m365.read'],
  };
