import type {
  DirectoryConflictKind,
  DirectoryConflictRow,
  DirectoryResolutionAction,
} from '../api/directory-sync-client.ts';

/** The order the queue renders groups in: most consequential decision first. */
export const CONFLICT_KIND_ORDER: DirectoryConflictKind[] = [
  'email_collision',
  'user_removed',
  'manager_ambiguous',
  'spine_collision',
  'unit_delete_blocked',
];

export const CONFLICT_KIND_LABEL: Record<DirectoryConflictKind, string> = {
  manager_ambiguous: 'Unclear team lead',
  email_collision: 'Email already belongs to someone',
  unit_delete_blocked: 'Department gone from Entra',
  spine_collision: 'Name clashes with a built-in unit',
  user_removed: 'Person removed from Entra',
};

/**
 * The per-group explanation. `unit_delete_blocked`'s is load-bearing rather than decorative: a
 * department RENAME in Entra is undetectable — the name is free text with no stable id, so a
 * rename reaches this sync as a delete plus a create. The conflict it raises clears itself on the
 * next run, and an admin who does not know that will "fix" a queue entry that was never broken.
 */
export const CONFLICT_KIND_NOTE: Record<DirectoryConflictKind, string> = {
  manager_ambiguous:
    'The people in this unit report to more than one manager in Entra, so there is no single answer to who leads it. The sync picked the manager with the most reports; choosing a head here pins it and stops the guess changing under you.',
  email_collision:
    'An Entra user has the work email of a person who was not created by this sync. Only one live person can hold an address, so link them if they are the same human — otherwise ignore it and fix the duplicate in Entra.',
  unit_delete_blocked:
    'A department disappeared from Entra while people or sub-units were still in it, so the sync left it alone rather than orphan them. Renaming a department in Entra looks exactly like this: the name is free text with no stable id, so a rename arrives as a delete plus a create. If you have just renamed one, leave this alone — it clears itself on the next run.',
  spine_collision:
    'An Entra department has the same name as one of the fixed units the org chart is built on. Those are never renamed or moved by the sync, so it needs to know whether they are the same team.',
  user_removed:
    'Entra no longer has this user, but their employment here is still open. The sync never ends employment on its own — that is a decision with payroll and access consequences.',
};

/** Every action the API can offer. Buttons are rendered from the served list, never from here. */
export const ACTION_LABEL: Record<DirectoryResolutionAction, string> = {
  choose_head: 'Choose lead',
  reassign: 'Move members, then delete',
  keep: 'Keep the unit',
  map_to_spine: 'Same team',
  create_distinct: 'Separate team',
  offboard: 'End employment',
  link: 'Link to a person',
  ignore: 'Ignore',
};

/** Actions that need the admin to pick something before the POST can be made. */
export const ACTIONS_NEEDING_INPUT: DirectoryResolutionAction[] = [
  'choose_head',
  'link',
  'reassign',
];

function str(detail: Record<string, unknown>, key: string): string | null {
  const value = detail[key];
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

function num(detail: Record<string, unknown>, key: string): number {
  const value = detail[key];
  return typeof value === 'number' ? value : 0;
}

export interface ConflictCandidate {
  person_id: string;
  full_name: string | null;
  work_email: string | null;
  report_count: number | null;
}

/**
 * The candidate people a `choose_head` or `link` must pick from. The resolver rejects any
 * `person_id` that is not in this list, so the picker offers exactly these and nothing else.
 */
export function conflictCandidates(conflict: DirectoryConflictRow): ConflictCandidate[] {
  const raw = conflict.detail.candidates;
  if (!Array.isArray(raw)) return [];
  const out: ConflictCandidate[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) continue;
    const row = entry as Record<string, unknown>;
    if (typeof row.person_id !== 'string') continue;
    out.push({
      person_id: row.person_id,
      full_name: typeof row.full_name === 'string' ? row.full_name : null,
      work_email: typeof row.work_email === 'string' ? row.work_email : null,
      report_count: typeof row.report_count === 'number' ? row.report_count : null,
    });
  }
  return out;
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/**
 * The row's headline — what this conflict is about. `detail` is kind-specific and passed through
 * verbatim by the server, so each kind reads its own keys and every one of them can be absent.
 */
export function conflictSubject(
  conflict: DirectoryConflictRow,
  nameFor: (personId: string) => string | null = () => null,
): string {
  const d = conflict.detail;
  switch (conflict.kind) {
    case 'manager_ambiguous':
    case 'unit_delete_blocked':
      return str(d, 'unit_name') ?? 'Unnamed unit';
    case 'email_collision':
      return str(d, 'full_name') ?? str(d, 'work_email') ?? 'Unnamed Entra user';
    case 'spine_collision':
      return str(d, 'entra_name') ?? 'Unnamed department';
    case 'user_removed': {
      // `detail.full_name` is resolved by the sync when it raises the conflict, so the row names
      // the person without this screen needing `people.worker.read` — which an M365 admin may not
      // hold. `nameFor` stays as a fallback for rows raised before that was added.
      const personId = str(d, 'person_id') ?? conflict.subject_id;
      return (
        str(d, 'full_name') ??
        (personId && nameFor(personId)) ??
        str(d, 'department') ??
        'Removed person'
      );
    }
  }
}

/** One line under the subject: the facts the decision turns on. */
export function conflictSummary(conflict: DirectoryConflictRow): string {
  const d = conflict.detail;
  switch (conflict.kind) {
    case 'manager_ambiguous': {
      const candidates = conflictCandidates(conflict);
      const chosen =
        typeof d.chosen === 'object' && d.chosen !== null
          ? ((d.chosen as Record<string, unknown>).full_name as string | undefined)
          : undefined;
      const guess = chosen ? ` Currently led by ${chosen}.` : '';
      return `${plural(candidates.length, 'manager', 'managers')} claim this unit in Entra.${guess}`;
    }
    case 'email_collision': {
      const email = str(d, 'work_email') ?? 'this address';
      const candidates = conflictCandidates(conflict);
      return `${email} already belongs to ${plural(candidates.length, 'person', 'people')} not managed by this sync.`;
    }
    case 'unit_delete_blocked': {
      const members = num(d, 'member_count');
      const children = num(d, 'child_count');
      const parts = [plural(members, 'person', 'people')];
      if (children > 0) parts.push(plural(children, 'sub-unit', 'sub-units'));
      return `Gone from Entra, but still holds ${parts.join(' and ')}.`;
    }
    case 'spine_collision': {
      const spine =
        typeof d.spine === 'object' && d.spine !== null
          ? ((d.spine as Record<string, unknown>).name as string | undefined)
          : undefined;
      const entra = str(d, 'entra_name') ?? 'This department';
      return spine
        ? `Entra's "${entra}" has the same name as the built-in "${spine}" unit.`
        : `Entra's "${entra}" collides with a built-in unit.`;
    }
    case 'user_removed': {
      const where = [str(d, 'division'), str(d, 'department')].filter(Boolean).join(' · ');
      return where
        ? `Last seen in ${where}. Employment here is still open.`
        : 'Employment here is still open.';
    }
  }
}

/** §11's counters, in reading order, with the labels the run-status region shows. */
export const COUNTER_LABELS: Array<{ key: string; label: string }> = [
  { key: 'users_seen', label: 'Seen' },
  { key: 'users_created', label: 'Created' },
  { key: 'users_updated', label: 'Updated' },
  { key: 'users_unchanged', label: 'Unchanged' },
  { key: 'users_filtered', label: 'Filtered out' },
  { key: 'users_removed', label: 'Removed' },
  { key: 'org_units_created', label: 'Units created' },
  { key: 'org_units_renamed', label: 'Units renamed' },
  { key: 'heads_set', label: 'Leads set' },
  { key: 'photos_stored', label: 'Photos stored' },
  { key: 'photos_missing', label: 'Photos missing' },
  { key: 'mailbox_forbidden', label: 'Mailboxes refused' },
];
