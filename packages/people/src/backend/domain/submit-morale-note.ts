import type { SessionScope } from '@seta/core';
import { emit, withEmit } from '@seta/core/events';
import { and, eq, inArray } from 'drizzle-orm';
import type { MoraleRecipientTag, SubmitMoraleInput } from '../../contracts.ts';
import { PEOPLE_MORALE_SUBMITTED } from '../../events.ts';
import { peopleDb } from '../db/client.ts';
import {
  moraleNote,
  moraleNoteRecipient,
  moraleRatingAggregate,
  person,
  userProjection,
} from '../db/schema.ts';
import { PeopleError, requirePermission } from '../rbac.ts';
import { vnYearMonth } from './month-clock.ts';
import { resolveSenderProjectContext } from './morale-project-context.ts';
import { resolveMoraleHrRecipients, resolveMoraleRecipients } from './resolve-morale-recipients.ts';

interface ResolvedRecipient {
  person_id: string;
  full_name: string | null;
  tag: MoraleRecipientTag;
}

/**
 * Enqueue an in-app notification without taking a dependency on @seta/notifications.
 * Mirrors `packages/planner/src/backend/subscribers/notification-trigger.ts`: the
 * outbox row IS the queue, so this commits with the note or not at all.
 */
async function enqueueNotification(input: {
  tenantId: string;
  userIds: string[];
  sourceEventId: string;
  hasConcern: boolean;
  noteId: string;
}): Promise<void> {
  if (input.userIds.length === 0) return;
  await emit({
    tenantId: input.tenantId,
    aggregateType: 'notification',
    aggregateId: input.sourceEventId,
    eventType: 'notification.requested',
    eventVersion: 1,
    payload: {
      target_event_type: PEOPLE_MORALE_SUBMITTED,
      target_payload: {
        title: 'New morale note',
        // Deliberately vague and rating-free: the notification is a nudge to open the
        // note, not a channel that leaks how someone scored themselves.
        body: input.hasConcern
          ? 'Someone raised a concern with you.'
          : 'Someone shared a morale note with you.',
        note_id: input.noteId,
      },
      user_ids: input.userIds,
      source_event_id: input.sourceEventId,
    },
  });
}

/** Recipient person_ids → the user accounts that can actually be notified. */
async function userIdsForPersons(tenantId: string, personIds: string[]): Promise<string[]> {
  if (personIds.length === 0) return [];
  const rows = await peopleDb()
    .select({ user_id: userProjection.user_id })
    .from(userProjection)
    .where(
      and(eq(userProjection.tenant_id, tenantId), inArray(userProjection.person_id, personIds)),
    );
  return rows.map((r) => r.user_id);
}

export async function submitMoraleNote(
  session: SessionScope,
  input: SubmitMoraleInput,
): Promise<{ note_id: string }> {
  requirePermission(session, 'people.performance.read');

  const senderPersonId = session.person_id;
  if (!senderPersonId) {
    throw new PeopleError('FORBIDDEN', 'No employee record linked to this user');
  }

  // Re-resolve rather than trust the client: between loading the form and pressing
  // Submit a recipient may have left, been deactivated, or lost the role. Flattening
  // the groups is lossless — resolution already gives each person a single tag.
  //
  // The project comes back from the same resolution instead of being read off the input,
  // so what gets stored is a project the sender demonstrably sits on — the client's value
  // is only ever a request.
  const { can_submit, groups, projects, selected_project_id } = await resolveMoraleRecipients(
    session,
    senderPersonId,
    input.project_id ?? null,
  );
  if (!can_submit) {
    throw new PeopleError('FORBIDDEN', 'No employee record is linked to this user');
  }

  // Several projects and nothing resolved means the sender either skipped the picker or
  // sent a project they are not on. Storing NULL would quietly file the note against no
  // project — and route it to no TL or AM — so it is refused instead.
  if (projects.length > 0 && !selected_project_id) {
    throw new PeopleError('VALIDATION', 'Select which project this note is about');
  }
  const byId = new Map(
    groups.flatMap((g) => g.candidates.map((c) => [c.person_id, { ...c, tag: g.tag }] as const)),
  );

  const stale = input.recipient_person_ids.filter((id) => !byId.has(id));
  if (stale.length > 0) {
    throw new PeopleError(
      'VALIDATION',
      `${stale.length} selected recipient(s) are no longer available — reopen the recipient list and try again`,
    );
  }

  // flatMap rather than map: the staleness check above already proved every id resolves,
  // so nothing is dropped here — it just avoids asserting that to the type system.
  const chosen: ResolvedRecipient[] = input.recipient_person_ids.flatMap((id) => {
    const c = byId.get(id);
    return c ? [{ person_id: c.person_id, full_name: c.full_name, tag: c.tag }] : [];
  });

  // HR is appended server-side on every note, so it cannot be dropped by the client.
  //
  // Recorded per (person, tag), not per person: an HR holder who is also a PMO can be
  // picked by the sender *and* be on the HR roster, and both facts are true. Collapsing
  // them to one row used to erase the HR one — a note sent to every PMO ended up with no
  // 'hr' row at all, so nothing in the record showed the guarantee had been honoured.
  const hr = await resolveMoraleHrRecipients(session.tenant_id, senderPersonId);
  const recipients: ResolvedRecipient[] = [...chosen];
  const seenHr = new Set<string>();
  for (const p of hr) {
    if (seenHr.has(p.person_id)) continue;
    seenHr.add(p.person_id);
    recipients.push({ person_id: p.person_id, full_name: p.full_name, tag: 'hr' });
  }

  // One person, one notification, however many reasons they are on the note for.
  const notifyPersonIds = [...new Set(recipients.map((r) => r.person_id))];

  if (recipients.length === 0) {
    throw new PeopleError('VALIDATION', 'No eligible recipients could be resolved for this note');
  }

  const [me] = await peopleDb()
    .select({ org_unit_id: person.org_unit_id })
    .from(person)
    .where(and(eq(person.id, senderPersonId), eq(person.tenant_id, session.tenant_id)));

  const senderOrgUnitId = me?.org_unit_id ?? null;
  // Frozen here rather than resolved when a recipient opens their inbox (FUT-786): a
  // transfer next month must not silently re-file notes someone has already read. The
  // project itself is the sender's, resolved above; this fills in the rest of the snapshot.
  const projectContext = await resolveSenderProjectContext(
    session.tenant_id,
    senderPersonId,
    selected_project_id,
  );
  const period = vnYearMonth();
  let noteId = '';

  await withEmit(
    { actor: { userId: session.user_id, tenantId: session.tenant_id } },
    async (tx) => {
      const [inserted] = await tx
        .insert(moraleNote)
        .values({
          tenant_id: session.tenant_id,
          person_id: senderPersonId,
          org_unit_id: senderOrgUnitId,
          rating: input.rating,
          concern_text: input.concern_text ?? null,
          // Null is the honest value for a sender with no allocation (HR, BoD): the note
          // is theirs, not any project's.
          project_id: selected_project_id,
          project_name_snapshot: projectContext?.project_name ?? null,
          account_id: projectContext?.account_id ?? null,
          sender_capacity: projectContext?.capacity ?? null,
        })
        .returning({ id: moraleNote.id });

      if (!inserted) throw new Error('morale_note insert returned no row');
      noteId = inserted.id;

      await tx.insert(moraleNoteRecipient).values(
        recipients.map((r) => ({
          note_id: noteId,
          recipient_person_id: r.person_id,
          recipient_tag: r.tag,
          full_name_snapshot: r.full_name,
        })),
      );

      // Rating goes to the anonymous store as well as the note, so trend reads never
      // have to touch an identifiable row.
      await tx.insert(moraleRatingAggregate).values({
        tenant_id: session.tenant_id,
        org_unit_id: senderOrgUnitId,
        period,
        rating: input.rating,
        // Delivery dimensions, so a lead or AM can be shown the trend for the group they
        // are accountable for. Still no person_id: what these add is how coarsely a
        // rating can be grouped, not a way back to who gave it.
        project_id: selected_project_id,
        account_id: projectContext?.account_id ?? null,
      });

      const { eventId } = await emit({
        tenantId: session.tenant_id,
        aggregateType: 'people.morale',
        aggregateId: noteId,
        eventType: PEOPLE_MORALE_SUBMITTED,
        eventVersion: 1,
        payload: {
          note_id: noteId,
          person_id: senderPersonId,
          tenant_id: session.tenant_id,
          recipient_person_ids: notifyPersonIds,
          has_concern: !!input.concern_text,
        },
      });

      await enqueueNotification({
        tenantId: session.tenant_id,
        userIds: await userIdsForPersons(session.tenant_id, notifyPersonIds),
        sourceEventId: eventId,
        hasConcern: !!input.concern_text,
        noteId,
      });
    },
  );

  return { note_id: noteId };
}
