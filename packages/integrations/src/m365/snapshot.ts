import type { Group } from '@microsoft/microsoft-graph-types';
import type { MemberRef } from './lww.ts';

export interface SyncSnapshot {
  name: string;
  description: string | null;
  visibility: 'private' | 'public';
  theme: 'teal' | 'purple' | 'green' | 'blue' | 'pink' | 'orange' | 'red';
  members: MemberRef[];
}

const THEME_FALLBACK = 'blue' as const;

// Mirrors the planner.groups check constraint — any value not in this set is
// rejected at the DB level, so we normalise to the fallback rather than let an
// invalid string through and surface a constraint violation at write time.
const KNOWN_THEMES = new Set<SyncSnapshot['theme']>([
  'teal',
  'purple',
  'green',
  'blue',
  'pink',
  'orange',
  'red',
]);

function normalizeTheme(t: string | null | undefined): SyncSnapshot['theme'] {
  if (!t) return THEME_FALLBACK;
  const lower = t.toLowerCase();
  // Narrowing through the Set check produces a plain string; the cast is safe
  // because we've verified membership against the exhaustive KNOWN_THEMES set.
  return KNOWN_THEMES.has(lower as SyncSnapshot['theme'])
    ? (lower as SyncSnapshot['theme'])
    : THEME_FALLBACK;
}

export function snapshotFromGraph(group: Group, members: MemberRef[]): SyncSnapshot {
  return {
    name: group.displayName ?? '',
    description: group.description ?? null,
    visibility: group.visibility === 'Public' ? 'public' : 'private',
    theme: normalizeTheme(group.theme),
    members,
  };
}
