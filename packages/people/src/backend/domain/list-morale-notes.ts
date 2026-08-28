import type { SessionScope } from '@seta/core';
import { and, desc, eq, gte, inArray, lt } from 'drizzle-orm';
import type {
  MoraleHistoryQuery,
  MoraleHistoryResponse,
  MoraleNoteView,
  MoraleRecipientTag,
} from '../../contracts.ts';
import { peopleDb } from '../db/client.ts';
import { moraleNote, moraleNoteRecipient } from '../db/schema.ts';
import { requirePermission } from '../rbac.ts';
import { VN_OFFSET_MS } from './month-clock.ts';

/** Same order the picker lists the roles in, so a note reads back the way it was written. */
const TAG_ORDER: MoraleRecipientTag[] = ['hr', 'pmo', 'bod', 'am', 'tl'];

/** Midnight in Asia/Ho_Chi_Minh for a 'YYYY-MM-DD' day, as a UTC instant. */
function vnMidnight(day: string, plusDays = 0): Date {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + plusDays) - VN_OFFSET_MS);
}

/**
 * Turns the sender's inclusive calendar window into a half-open instant range.
 *
 * `endAt` is the midnight *after* `to`, not `to` itself: the filter is expressed in days,
 * so a note filed at 17:00 on the last selected day still belongs inside it. Both bounds
 * are Vietnam midnights rather than UTC ones, so the days match the calendar the sender
 * picked from.
 */
export function moraleHistoryWindow(query: MoraleHistoryQuery): {
  startAt: Date | null;
  endAt: Date | null;
} {
  return {
    startAt: query.from ? vnMidnight(query.from) : null,
    endAt: query.to ? vnMidnight(query.to, 1) : null,
  };
}

export async function listMoraleNotes(
  session: SessionScope,
  query: MoraleHistoryQuery = {},
): Promise<MoraleHistoryResponse> {
  requirePermission(session, 'people.performance.read');

  if (!session.person_id) {
    return { notes: [] };
  }

  const db = peopleDb();
  const { startAt, endAt } = moraleHistoryWindow(query);

  const notes = await db
    .select({
      id: moraleNote.id,
      rating: moraleNote.rating,
      concern_text: moraleNote.concern_text,
      submitted_at: moraleNote.submitted_at,
    })
    .from(moraleNote)
    .where(
      and(
        eq(moraleNote.tenant_id, session.tenant_id),
        eq(moraleNote.person_id, session.person_id),
        ...(startAt ? [gte(moraleNote.submitted_at, startAt)] : []),
        ...(endAt ? [lt(moraleNote.submitted_at, endAt)] : []),
      ),
    )
    .orderBy(desc(moraleNote.submitted_at));

  if (notes.length === 0) return { notes: [] };

  const noteIds = notes.map((n) => n.id);
  const recipients = await db
    .select({
      note_id: moraleNoteRecipient.note_id,
      recipient_tag: moraleNoteRecipient.recipient_tag,
      full_name_snapshot: moraleNoteRecipient.full_name_snapshot,
    })
    .from(moraleNoteRecipient)
    .where(inArray(moraleNoteRecipient.note_id, noteIds));

  const recipientsByNote = new Map<string, MoraleNoteView['recipients']>();
  const hrNotes = new Set<string>();
  for (const r of recipients) {
    const tag = r.recipient_tag as MoraleRecipientTag;
    // Every note goes to the whole HR roster, so listing them by name would turn the
    // history into an HR directory. Collapse them to the single role they were sent as.
    if (tag === 'hr') {
      hrNotes.add(r.note_id);
      continue;
    }
    const list = recipientsByNote.get(r.note_id) ?? [];
    list.push({ recipient_tag: tag, full_name_snapshot: r.full_name_snapshot });
    recipientsByNote.set(r.note_id, list);
  }
  for (const noteId of hrNotes) {
    const list = recipientsByNote.get(noteId) ?? [];
    list.push({ recipient_tag: 'hr', full_name_snapshot: null });
    recipientsByNote.set(noteId, list);
  }

  const result: MoraleNoteView[] = notes.map((n) => ({
    id: n.id,
    rating: n.rating,
    concern_text: n.concern_text,
    submitted_at: n.submitted_at.toISOString(),
    recipients: (recipientsByNote.get(n.id) ?? []).sort(
      (a, b) => TAG_ORDER.indexOf(a.recipient_tag) - TAG_ORDER.indexOf(b.recipient_tag),
    ),
  }));

  return { notes: result };
}
