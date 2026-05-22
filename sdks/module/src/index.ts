import type { ComponentType } from 'react';

export interface NavManifest {
  id: string;
  label: string;
  icon: ComponentType;
  requiredPermissions: string[];
  nav: NavItem[];
}

export interface NavItem {
  id: string;
  label: string;
  to: string;
  icon?: ComponentType;
  requires?: string[];
  children?: NavItem[];
}
