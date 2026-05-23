import type { NavItem, NavManifest } from '@seta/module-sdk';

export interface SessionLike {
  role_summary: { roles: string[] };
}

function matches(required: string[], session: SessionLike): boolean {
  if (required.length === 0) return true;
  for (const r of required) {
    if (session.role_summary.roles.includes(r)) return true;
  }
  return false;
}

export function visibleManifests(
  manifests: ReadonlyArray<NavManifest>,
  session: SessionLike,
  enabledModuleIds: ReadonlySet<string>,
): NavManifest[] {
  return manifests.filter((m) => {
    if (!enabledModuleIds.has(m.id)) return false;
    return matches(m.requiredPermissions, session);
  });
}

export function filterNavItems(items: ReadonlyArray<NavItem>, session: SessionLike): NavItem[] {
  const out: NavItem[] = [];
  for (const item of items) {
    if (item.requires && !matches(item.requires, session)) continue;
    out.push(item.children ? { ...item, children: filterNavItems(item.children, session) } : item);
  }
  return out;
}

export function activeNavId(
  manifests: ReadonlyArray<NavManifest>,
  pathname: string,
): string | undefined {
  let bestId: string | undefined;
  let bestLen = -1;
  for (const m of manifests) {
    const candidates: NavItem[] = [...m.nav];
    for (const item of candidates) {
      if (item.children) candidates.push(...item.children);
      if (!item.to) continue;
      if (pathname === item.to || pathname.startsWith(`${item.to}/`)) {
        if (item.to.length > bestLen) {
          bestLen = item.to.length;
          bestId = item.id;
        }
      }
    }
  }
  return bestId;
}
