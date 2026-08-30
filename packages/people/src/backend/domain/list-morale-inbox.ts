import type { SessionScope } from '@seta/core';
import { and, desc, eq, exists, gte, inArray, isNull, lt, type SQL, sql } from 'drizzle-orm';
import type {
  MoraleInboxNote,
  MoraleInboxProjectGroup,
  MoraleInboxQuery,
  MoraleInboxResponse,
  MoraleRecipientTag,
  MoraleSenderCapacity,
} from '../../contracts.ts';
import { peopleDb } from '../db/client.ts';
import { moraleNote, moraleNoteRead, moraleNoteRecipient, person } from '../db/schema.ts';
import { PeopleError, requirePermission } from '../rbac.ts';
import { moraleHistoryWindow } from './list-morale-notes.ts';
import { resolveMoraleReviewerScope } from './morale-reviewer-scope.ts';

/** Same order the picker lists the roles in, so a note reads back the way it was written. */
const TAG_ORDER: MoraleRecipientTag[] = ['hr', 'pmo', 'bod', 'am', 'tl'];

/** The group senders with no active allocation fall into. */
export const NO_PROJECT_LABEL = 'No project';

/** The `project_id` value that selects that group, since null cannot travel in a query string. */
export const NO_PROJECT_FILTER = 'none';

/**
 * Notes this person was chosen for, and only those (AC1).
 *
 * HR needs no special case: HR is written onto `morale_note_recipient` for every note at
 * submit time, so "addressed to me" already means "all of them" for an HR holder. The
 * check is a correlated EXISTS rather than a join because a note can carry two rows for
 * the same person (picked as PMO *and* on the HR roster) and a join would double it.
 */
export function addressedTo(readerPersonId: string): SQL {
  return exists(
    peopleDb()
      .select({ one: sql`1` })
      .from(moraleNoteRecipient)
      .where(
        and(
          eq(moraleNoteRecipient.note_id, moraleNote.id),
          eq(moraleNoteRecipient.recipient_person_id, readerPersonId),
        ),
      ),
  );
}

/** Read state for one reader, as a left-joinable condition. */
export function readByCondition(readerPersonId: string): SQL {
  return and(
    eq(moraleNoteRead.note_id, moraleNote.id),
    eq(moraleNoteRead.reader_person_id, readerPersonId),
  ) as SQL;
}

/** The filters shared by the list and its option lists, so the two can never disagree. */
export function inboxFilters(
  session: SessionScope,
  readerPersonId: string,
  query: MoraleInboxQuery,
): SQL[] {
  const { startAt, endAt } = moraleHistoryWindow({ from: query.from, to: query.to });
  const filters: SQL[] = [eq(moraleNote.tenant_id, session.tenant_id), addressedTo(readerPersonId)];

  if (startAt) filters.push(gte(moraleNote.submitted_at, startAt));
  if (endAt) filters.push(lt(moraleNote.submitted_at, endAt));
  if (query.sender_person_id) filters.push(eq(moraleNote.person_id, query.sender_person_id));
  if (query.project_id === NO_PROJECT_FILTER) filters.push(isNull(moraleNote.project_id));
  else if (query.project_id) filters.push(eq(moraleNote.project_id, query.project_id));

  return filters;
}

/**
 * Guards every manager-side morale read.
 *
 * `people.performance.read` is held by roles that must never reach this surface, so it is
 * the floor and not the gate — the capacity check is what actually decides. Returning the
 * caller's person_id here means no caller downstream has to re-derive "who am I".
 */
export async function requireMoraleReviewer(session: SessionScope): Promise<string> {
  requirePermission(session, 'people.performance.read');

  const { can_review } = await resolveMoraleReviewerScope(session);
  if (!can_review || !session.person_id) {
    throw new PeopleError('FORBIDDEN', 'Morale notes are only visible to their recipients');
  }
  return session.person_id;
}

/**
 * The recipient's inbox, grouped by the project each sender wrote from (FUT-786).
 *
 * Ratings are never selected here (AC4) — not hidden downstream, not selected at all, so
 * no future change to the serialiser can leak one. A rating submitted with no text still
 * appears, with a null `concern_text`: the sender did reach out, and silently dropping
 * their submission would misrepresent how many people responded.
 */
export async function listMoraleInbox(
  session: SessionScope,
  query: MoraleInboxQuery = {},
): Promise<MoraleInboxResponse> {
  const me = await requireMoraleReviewer(session);
  const db = peopleDb();

  const rows = await db
    .select({
      id: moraleNote.id,
      sender_person_id: moraleNote.person_id,
      sender_name: person.full_name,
      sender_capacity: moraleNote.sender_capacity,
      submitted_at: moraleNote.submitted_at,
      concern_text: moraleNote.concern_text,
      project_id: moraleNote.project_id,
      project_name_snapshot: moraleNote.project_name_snapshot,
      read_at: moraleNoteRead.read_at,
    })
    .from(moraleNote)
    .leftJoin(person, eq(person.id, moraleNote.person_id))
    .leftJoin(moraleNoteRead, readByCondition(me))
    .where(and(...inboxFilters(session, me, query)))
    .orderBy(desc(moraleNote.submitted_at));

  // Applied after the join rather than inside it: `unread_only` is a property of the
  // reader's row being absent, which a join condition cannot express.
  const visible = query.unread_only ? rows.filter((r) => r.read_at === null) : rows;
  if (visible.length === 0) return { total_notes: 0, unread_notes: 0, projects: [] };

  const tagsByNote = await loadRecipientTags(
    visible.map((r) => r.id),
    me,
  );

  const notes: (MoraleInboxNote & { project_id: string | null; project_name: string })[] =
    visible.map((r) => ({
      id: r.id,
      sender_person_id: r.sender_person_id,
      sender_name: r.sender_name,
      sender_capacity: (r.sender_capacity as MoraleSenderCapacity | null) ?? null,
      submitted_at: r.submitted_at.toISOString(),
      concern_text: r.concern_text,
      recipient_tags: tagsByNote.get(r.id)?.all ?? [],
      my_tags: tagsByNote.get(r.id)?.mine ?? [],
      is_read: r.read_at !== null,
      project_id: r.project_id,
      project_name: r.project_name_snapshot ?? NO_PROJECT_LABEL,
    }));

  return {
    total_notes: notes.length,
    unread_notes: notes.filter((n) => !n.is_read).length,
    projects: groupByProject(notes),
  };
}

/**
 * Roles a note went to, deduped — recipients see who else was told, never by name — split
 * from the roles this particular reader is one of.
 *
 * The two are separate lists rather than a flag per tag because they answer separate
 * questions, and the reader's own roles are a strict subset: a tag lands in `mine` when
 * *this* reader carries it, and stays in `all` regardless of who else does.
 *
 * `selectDistinct` runs over the ownership flag as well as the tag, so a role held by the
 * reader and by someone else yields two rows; the dedupe below folds them back into one
 * entry in `all` while keeping the reader's claim on it.
 */
export async function loadRecipientTags(
  noteIds: string[],
  readerPersonId: string,
): Promise<Map<string, { all: MoraleRecipientTag[]; mine: MoraleRecipientTag[] }>> {
  const rows = await peopleDb()
    .selectDistinct({
      note_id: moraleNoteRecipient.note_id,
      recipient_tag: moraleNoteRecipient.recipient_tag,
      is_mine: sql<boolean>`${moraleNoteRecipient.recipient_person_id} = ${readerPersonId}`,
    })
    .from(moraleNoteRecipient)
    .where(inArray(moraleNoteRecipient.note_id, noteIds));

  const byNote = new Map<string, { all: Set<MoraleRecipientTag>; mine: Set<MoraleRecipientTag> }>();
  for (const r of rows) {
    const entry = byNote.get(r.note_id) ?? { all: new Set(), mine: new Set() };
    const tag = r.recipient_tag as MoraleRecipientTag;
    entry.all.add(tag);
    if (r.is_mine) entry.mine.add(tag);
    byNote.set(r.note_id, entry);
  }

  const inTagOrder = (tags: Set<MoraleRecipientTag>) =>
    [...tags].sort((a, b) => TAG_ORDER.indexOf(a) - TAG_ORDER.indexOf(b));

  return new Map(
    [...byNote].map(([noteId, entry]) => [
      noteId,
      { all: inTagOrder(entry.all), mine: inTagOrder(entry.mine) },
    ]),
  );
}

/**
 * Groups already-sorted notes by project, newest project first.
 *
 * "Newest project" means the project holding the most recent note, so a team that raised
 * something this morning sits above one that last wrote in June — the same ordering the
 * notes themselves use, applied one level up.
 */
function groupByProject(
  notes: (MoraleInboxNote & { project_id: string | null; project_name: string })[],
): MoraleInboxProjectGroup[] {
  const groups = new Map<string, MoraleInboxProjectGroup>();

  for (const { project_id, project_name, ...note } of notes) {
    const key = project_id ?? NO_PROJECT_FILTER;
    const group = groups.get(key) ?? {
      project_id,
      project_name,
      total_notes: 0,
      unread_notes: 0,
      notes: [],
    };
    group.notes.push(note);
    group.total_notes += 1;
    if (!note.is_read) group.unread_notes += 1;
    groups.set(key, group);
  }

  return [...groups.values()];
}
