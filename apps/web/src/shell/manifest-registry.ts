import type { AppManifest, NavItem, NavSection } from '@seta/module-sdk';
import { PRODUCT_IDS } from '@seta/shared-rbac';

export interface SessionLike {
  permissions: ReadonlySet<string>;
  features?: ReadonlySet<string>;
  product_access?: ReadonlySet<string>;
}

const PRODUCT_ID_SET = new Set<string>(PRODUCT_IDS);

function matches(required: readonly string[], session: SessionLike): boolean {
  return required.length === 0 || required.some((p) => session.permissions.has(p));
}

export function visibleManifests(
  manifests: ReadonlyArray<AppManifest>,
  session: SessionLike,
  enabledModuleIds: ReadonlySet<string>,
): AppManifest[] {
  return manifests.filter((m) => {
    if (!enabledModuleIds.has(m.id)) return false;
    if (
      PRODUCT_ID_SET.has(m.id) &&
      session.product_access !== undefined &&
      !session.product_access.has(m.id)
    )
      return false;
    if (m.requiredFeature && !session.features?.has(m.requiredFeature)) return false;
    return matches(m.requiredPermissions, session);
  });
}

function filterItemList(items: ReadonlyArray<NavItem>, session: SessionLike): NavItem[] {
  const out: NavItem[] = [];
  for (const item of items) {
    if (item.requires && !matches(item.requires, session)) continue;
    out.push(item.children ? { ...item, children: filterItemList(item.children, session) } : item);
  }
  return out;
}

export function filterNavSections(
  sections: ReadonlyArray<NavSection>,
  session: SessionLike,
): NavSection[] {
  const out: NavSection[] = [];
  for (const section of sections) {
    const items = filterItemList(section.items, session);
    if (items.length === 0) continue;
    out.push({ label: section.label, items });
  }
  return out;
}

export function activeAppId(
  apps: ReadonlyArray<AppManifest>,
  pathname: string,
): string | undefined {
  let bestId: string | undefined;
  let bestLen = -1;
  for (const app of apps) {
    const ns = app.routeNamespace;
    if ((pathname === ns || pathname.startsWith(`${ns}/`)) && ns.length > bestLen) {
      bestLen = ns.length;
      bestId = app.id;
    }
  }
  return bestId;
}

export function activeNavId(
  manifests: ReadonlyArray<AppManifest>,
  pathname: string,
): string | undefined {
  let bestId: string | undefined;
  let bestLen = -1;
  for (const m of manifests) {
    const candidates: NavItem[] = [];
    for (const section of m.nav) candidates.push(...section.items);
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
