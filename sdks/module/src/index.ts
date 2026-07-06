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
  indent?: number;
  disabled?: boolean;
  disabledHint?: string;
  badge?: string | number;
  badgeTone?: NavBadgeTone;
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
