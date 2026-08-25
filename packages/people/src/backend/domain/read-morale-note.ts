import type { SessionScope } from '@seta/core';
import { and, eq } from 'drizzle-orm';
import type { MoraleInboxNote, MoraleRecipientTag, MoraleSenderCapacity } from '../../contracts.ts';
import { peopleDb } from '../db/client.ts';
import { moraleNote, moraleNoteRead, moraleNoteRecipient, person } from '../db/schema.ts';
import { PeopleError } from '../rbac.ts';
import { addressedTo, readByCondition, requireMoraleReviewer } from './list-morale-inbox.ts';

/**
 * One note, for the detail dialog.
 *
 * Recipiency is re-checked here rather than assumed from the list (AC1: opening a note I
 * was not selected for *returns an error*, it is not merely absent from my inbox). A note
 * id is guessable in a way a list response is not, so the read path needs its own gate.
 *
 * Same shape as the inbox row, ratings included by omission: the dialog shows nothing the
 * list did not already carry, it just shows the text in full.
 */
export async function getMoraleNote(
  session: SessionScope,
  noteId: string,
): Promise<MoraleInboxNote> {
  const me = await requireMoraleReviewer(session);

  const [row] = await peopleDb()
    .select({
      id: moraleNote.id,
      sender_person_id: moraleNote.person_id,
      sender_name: person.full_name,
      sender_capacity: moraleNote.sender_capacity,
      submitted_at: moraleNote.submitted_at,
      concern_text: moraleNote.concern_text,
      read_at: moraleNoteRead.read_at,
    })
    .from(moraleNote)
    .leftJoin(person, eq(person.id, moraleNote.person_id))
    .leftJoin(moraleNoteRead, readByCondition(me))
    .where(
      and(eq(moraleNote.tenant_id, session.tenant_id), eq(moraleNote.id, noteId), addressedTo(me)),
    );

  // One error for "no such note" and "not yours" on purpose: telling the two apart would
  // confirm a note exists to someone who was never meant to know it was written.
  if (!row) {
    throw new PeopleError('NOT_FOUND', 'No morale note addressed to you with that id');
  }

  const tags = await peopleDb()
    .selectDistinct({ recipient_tag: moraleNoteRecipient.recipient_tag })
    .from(moraleNoteRecipient)
    .where(eq(moraleNoteRecipient.note_id, noteId));

  return {
    id: row.id,
    sender_person_id: row.sender_person_id,
    sender_name: row.sender_name,
    sender_capacity: (row.sender_capacity as MoraleSenderCapacity | null) ?? null,
    submitted_at: row.submitted_at.toISOString(),
    concern_text: row.concern_text,
    recipient_tags: tags.map((t) => t.recipient_tag as MoraleRecipientTag),
    is_read: row.read_at !== null,
  };
}

/**
 * Marks a note read for this reader alone (AC2).
 *
 * Per reader, not per note: HR is a recipient of every note, so a shared flag would let
 * HR clear the badge for a Team Lead who never opened it. Re-reading is a no-op rather
 * than an error — the client fires this on every open, and the first `read_at` is the one
 * worth keeping.
 */
export async function markMoraleNoteRead(session: SessionScope, noteId: string): Promise<void> {
  const me = await requireMoraleReviewer(session);

  const [note] = await peopleDb()
    .select({ id: moraleNote.id })
    .from(moraleNote)
    .where(
      and(eq(moraleNote.tenant_id, session.tenant_id), eq(moraleNote.id, noteId), addressedTo(me)),
    );

  if (!note) {
    throw new PeopleError('NOT_FOUND', 'No morale note addressed to you with that id');
  }

  await peopleDb()
    .insert(moraleNoteRead)
    .values({ note_id: noteId, reader_person_id: me })
    .onConflictDoNothing();
}
