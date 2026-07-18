import type { PermissionKey } from '@seta/shared-rbac';
import type { ComponentType, SVGProps } from 'react';

export type NavIcon = ComponentType<SVGProps<SVGSVGElement>>;

export type NavBadgeTone = 'primary' | 'warning' | 'danger' | 'success' | 'muted';

export interface NavItem {
  id: string;
  label: string;
  to?: string;
  icon?: NavIcon;
  requires?: PermissionKey[];
  children?: NavItem[];
  disabled?: boolean;
  disabledHint?: string;
  badge?: string | number;
  badgeTone?: NavBadgeTone;
  /**
   * Click handler for items that act rather than navigate — e.g. a "Show more"
   * row or a thread that navigates with search params (which `to` can't
   * express). Rendered as a button when there's no `to`.
   */
  onClick?: () => void;
  /**
   * Render this item's `children` inside a collapsible disclosure (Astryx
   * SideNavItem). `true` starts expanded; `{ defaultIsCollapsed }` controls the
   * initial state. Only meaningful when the item has children.
   */
  collapsible?: boolean | { defaultIsCollapsed?: boolean };
  /**
   * Force the selected state. The shell's pathname-based active resolution only
   * sees static `nav` items with a `to`; dynamic items (e.g. a chat thread that
   * navigates via search param) declare their own selected state here.
   */
  isSelected?: boolean;
  /**
   * Render the label in italics to mark it as a secondary action (e.g. a
   * "Show more" row) rather than a peer of the surrounding items.
   */
  italic?: boolean;
}

export interface NavSection {
  /**
   * Uppercase eyebrow label rendered above the section's items. Omit for a
   * flat, headerless section (used by apps with few enough items that grouping
   * adds noise rather than structure).
   */
  label?: string;
  items: NavItem[];
}

export interface AppManifest {
  id: string;
  label: string;
  icon: NavIcon;
  /** URL namespace this app owns, e.g. '/planner'. Drives launcher → active-app routing. */
  routeNamespace: string;
  /** Optional launcher-tile accent colour (CSS colour string). */
  color?: string;
  /**
   * System apps (e.g. Settings) drive shell chrome — breadcrumb + left nav —
   * but are reached from the account menu, not the 9-dot launcher grid. When
   * true, the launcher omits this app while active-app resolution still finds it.
   */
  hideInLauncher?: boolean;
  requiredPermissions: PermissionKey[];
  /**
   * Sections grouping nav items inside this module. Every manifest must declare
   * at least one section; single-section modules pass a single entry.
   */
  nav: NavSection[];
  /**
   * React hook returning extra NavSections appended after `nav`. The shell
   * calls this for every manifest in registration order on every render, so it
   * must follow the rules of hooks (always called, stable order).
   *
   * Manifests without dynamic items should set this to `noNavExtensions` from
   * this package to satisfy the always-called contract with a no-op.
   */
  useNavExtensions: () => NavSection[];
}

const EMPTY_EXTENSIONS: NavSection[] = [];
export function noNavExtensions(): NavSection[] {
  return EMPTY_EXTENSIONS;
}

function mergeItem(base: NavItem, ext: NavItem): NavItem {
  // Base owns identity (label/icon/to) since it drives active-state resolution
  // in the shell; the extension contributes dynamic augmentation.
  return {
    ...base,
    ...(ext.children !== undefined && { children: ext.children }),
    ...(ext.collapsible !== undefined && { collapsible: ext.collapsible }),
    ...(ext.onClick !== undefined && { onClick: ext.onClick }),
    ...(ext.badge !== undefined && { badge: ext.badge }),
    ...(ext.badgeTone !== undefined && { badgeTone: ext.badgeTone }),
  };
}

function mergeItems(base: NavItem[], ext: NavItem[]): NavItem[] {
  const extById = new Map(ext.map((i) => [i.id, i]));
  const merged = base.map((item) => {
    const match = extById.get(item.id);
    if (!match) return item;
    extById.delete(item.id);
    return mergeItem(item, match);
  });
  // Extension items with no static counterpart append after the static ones.
  for (const item of ext) if (extById.has(item.id)) merged.push(item);
  return merged;
}

/**
 * Folds a manifest's dynamic `useNavExtensions()` output into its static `nav`.
 *
 * Sections and items are matched by label / id: a matching item is *augmented*
 * (the extension's `children`, `collapsible`, `onClick`, `badge` win; its
 * `label`/`icon`/`to` stay from the static item so active-state resolution —
 * which only sees static `nav` — keeps working). Unmatched extension items
 * append within their section; unmatched extension sections append after the
 * static ones. Replaces the former `[...app.nav, ...extensions]` concat so an
 * app can hang live sub-items under an existing top-level nav item.
 */
export function mergeNavSections(base: NavSection[], ext: NavSection[]): NavSection[] {
  if (ext.length === 0) return base;
  const remaining = [...ext];
  const merged = base.map((section) => {
    const idx = remaining.findIndex((e) => e.label === section.label);
    if (idx === -1) return section;
    const match = remaining[idx];
    remaining.splice(idx, 1);
    return { label: section.label, items: mergeItems(section.items, match?.items ?? []) };
  });
  return [...merged, ...remaining];
}
