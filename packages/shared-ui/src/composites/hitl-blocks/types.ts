import type { ReactNode } from 'react';

export interface EntityRef {
  id: string;
  type: string;
  label: string;
  secondary?: string;
  score?: number;
  primary?: boolean;
  meta?: Record<string, unknown>;
}

export interface BlockProps {
  block: Record<string, unknown>;
  selectedIds?: string[];
  onToggle?: (id: string) => void;
  renderEntity?: (entity: EntityRef) => ReactNode;
}
