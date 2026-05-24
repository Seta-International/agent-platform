import type { ComponentType, SVGProps } from 'react';

export type NavIcon = ComponentType<SVGProps<SVGSVGElement>>;

export type NavBadgeTone = 'primary' | 'warning' | 'danger' | 'success' | 'muted';

export interface NavItem {
  id: string;
  label: string;
  to?: string;
  icon?: NavIcon;
  requires?: string[];
  children?: NavItem[];
  indent?: number;
  disabled?: boolean;
  disabledHint?: string;
  badge?: string | number;
  badgeTone?: NavBadgeTone;
}

export interface NavSection {
  /** Uppercase eyebrow label rendered above the section's items. */
  label: string;
  items: NavItem[];
}

export interface NavManifest {
  id: string;
  label: string;
  icon: NavIcon;
  requiredPermissions: string[];
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
