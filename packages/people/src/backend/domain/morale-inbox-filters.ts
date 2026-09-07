import type { SessionScope } from '@seta/core';
import { and, desc, eq } from 'drizzle-orm';
import type {
  MoraleInboxFiltersResponse,
  MoraleInboxProjectOption,
  MoraleInboxQuery,
  MoraleInboxSenderOption,
} from '../../contracts.ts';
import { peopleDb } from '../db/client.ts';
import { moraleNote, person } from '../db/schema.ts';
import { inboxFilters, NO_PROJECT_LABEL, requireMoraleReviewer } from './list-morale-inbox.ts';

/**
 * The Project and Sender option lists for the inbox, over the same window the list uses.
 *
 * Built from the notes themselves rather than from the org chart: a project with no notes
 * in the window is not a filter anyone can usefully apply, and offering it would let the
 * inbox promise a result it cannot produce. Rating-only submissions count — the sender
 * did respond, so they belong in the list even though their note carries no text.
 *
 * Every sender carries the project they wrote from, so the client can narrow one picker
 * from the other (pick a sender → Project offers only theirs; pick a project → Sender
 * offers only the people who wrote from it) without a request per keystroke, and without
 * the two lists ever drifting out of agreement.
 */
export async function listMoraleInboxFilters(
  session: SessionScope,
  window: Pick<MoraleInboxQuery, 'from' | 'to'> = {},
): Promise<MoraleInboxFiltersResponse> {
  const me = await requireMoraleReviewer(session);

  // Newest first so the de-duplication below keeps the current snapshot for a sender who
  // changed team inside the window — the picker states where someone writes from now.
  const rows = await peopleDb()
    .select({
      sender_person_id: moraleNote.person_id,
      sender_name: person.full_name,
      project_id: moraleNote.project_id,
      project_name_snapshot: moraleNote.project_name_snapshot,
    })
    .from(moraleNote)
    .leftJoin(person, eq(person.id, moraleNote.person_id))
    .where(and(...inboxFilters(session, me, window)))
    .orderBy(desc(moraleNote.submitted_at));

  const projects = new Map<string, MoraleInboxProjectOption>();
  const senders = new Map<string, MoraleInboxSenderOption>();

  for (const r of rows) {
    projects.set(r.project_id ?? '', {
      project_id: r.project_id,
      name: r.project_name_snapshot ?? NO_PROJECT_LABEL,
    });
    if (!senders.has(r.sender_person_id)) {
      senders.set(r.sender_person_id, {
        person_id: r.sender_person_id,
        full_name: r.sender_name,
        project_id: r.project_id,
      });
    }
  }

  return {
    projects: [...projects.values()].sort(byProjectName),
    senders: [...senders.values()].sort(bySenderName),
  };
}

/** Named projects alphabetically, with "No project" last — it is a fallback, not a team. */
function byProjectName(a: MoraleInboxProjectOption, b: MoraleInboxProjectOption): number {
  if (a.project_id === null) return 1;
  if (b.project_id === null) return -1;
  return a.name.localeCompare(b.name);
}

function bySenderName(a: MoraleInboxSenderOption, b: MoraleInboxSenderOption): number {
  return (a.full_name ?? '').localeCompare(b.full_name ?? '');
}
