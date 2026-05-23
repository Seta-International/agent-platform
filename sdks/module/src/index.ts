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

export interface NavManifest {
  id: string;
  label: string;
  icon: NavIcon;
  requiredPermissions: string[];
  nav: NavItem[];
  /**
   * React hook returning extra NavItems appended after `nav`. The shell calls
   * this for every manifest in registration order on every render, so it must
   * follow the rules of hooks (always called, stable order).
   *
   * Manifests without dynamic items should set this to `noNavExtensions` from
   * this package to satisfy the always-called contract with a no-op.
   */
  useNavExtensions: () => NavItem[];
}

const EMPTY_EXTENSIONS: NavItem[] = [];
export function noNavExtensions(): NavItem[] {
  return EMPTY_EXTENSIONS;
}
