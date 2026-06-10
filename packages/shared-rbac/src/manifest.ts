export type Statement = Record<string, readonly string[]>;

export interface ModuleRbacManifest {
  module: string;
  permissions: { key: string; description: string }[];
  roles: { slug: string; description: string; permissions: string[] }[];
}

export function canonicalKeys(statement: Statement): string[] {
  const keys: string[] = [];
  for (const [resource, actions] of Object.entries(statement)) {
    for (const action of actions) keys.push(`${resource}.${action}`);
  }
  return keys;
}

export function toManifest(
  module: string,
  statement: Statement,
  roleStatements: Record<string, Statement>,
  roleDescriptions: Record<string, string>,
  permissionDescriptions: Record<string, string> = {},
): ModuleRbacManifest {
  const permissions = canonicalKeys(statement).map((key) => ({
    key,
    description: permissionDescriptions[key] ?? key,
  }));
  const roles = Object.entries(roleStatements).map(([slug, st]) => ({
    slug,
    description: roleDescriptions[slug] ?? slug,
    permissions: canonicalKeys(st).sort(),
  }));
  return { module, permissions, roles };
}
