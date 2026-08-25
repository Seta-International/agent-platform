import type { SessionEnv } from '@seta/core';
import type { Hono } from 'hono';
import {
  moraleHistoryQuery,
  moraleInboxQuery,
  moraleTrendQuery,
  submitMoraleInput,
} from '../../contracts.ts';
import { listMoraleInbox } from '../domain/list-morale-inbox.ts';
import { listMoraleNotes } from '../domain/list-morale-notes.ts';
import { listMoraleInboxFilters } from '../domain/morale-inbox-filters.ts';
import { resolveMoraleReviewerScope } from '../domain/morale-reviewer-scope.ts';
import { getMoraleTrend } from '../domain/morale-trend.ts';
import { getMoraleNote, markMoraleNoteRead } from '../domain/read-morale-note.ts';
import { resolveMoraleRecipients } from '../domain/resolve-morale-recipients.ts';
import { submitMoraleNote } from '../domain/submit-morale-note.ts';

export function registerPeopleMoraleRoutes(app: Hono<SessionEnv>): void {
  // No scope params on any of these: a morale note belongs to the signed-in person,
  // not to a project.
  //
  // Reading the form is open to every role the nav shows it to — `can_submit` carries the
  // Member / Team Lead gate, so a caller outside those capacities gets the page's own
  // explanation rather than a 403. Submitting is still refused; see `submitMoraleNote`.
  //
  // `can_review` rides along because the page cannot paint a single tab until it knows
  // both answers, and asking twice would flash a tab strip that then changes shape.
  app.get('/api/people/v1/morale/recipients', async (c) => {
    const session = c.get('user');
    const [form, scope] = await Promise.all([
      resolveMoraleRecipients(session, session.person_id),
      resolveMoraleReviewerScope(session),
    ]);
    return c.json({ ...form, can_review: scope.can_review });
  });

  app.post('/api/people/v1/morale', async (c) => {
    const input = submitMoraleInput.parse(await c.req.json());
    return c.json(await submitMoraleNote(c.get('user'), input), 201);
  });

  app.get('/api/people/v1/morale/history', async (c) => {
    // A malformed date in a bookmarked URL should show the sender their notes rather than
    // an error page, so the window falls back to open-ended instead of rejecting.
    const query = moraleHistoryQuery.catch({}).parse({
      from: c.req.query('from'),
      to: c.req.query('to'),
    });
    return c.json(await listMoraleNotes(c.get('user'), query));
  });

  // ---- Recipient side (FUT-786) -----------------------------------------
  //
  // Every route below is gated on being an actual recipient, inside the domain rather
  // than here: the inbox filters per note, and the trend answers only for the group the
  // caller is accountable for. Nothing accepts a scope from the client.

  app.get('/api/people/v1/morale/inbox', async (c) => {
    // Same forgiving parse as history: a stale bookmark should open the inbox, not an
    // error page. A filter the server cannot read is simply not applied.
    const query = moraleInboxQuery.catch({}).parse({
      from: c.req.query('from'),
      to: c.req.query('to'),
      project_id: c.req.query('project_id'),
      sender_person_id: c.req.query('sender_person_id'),
      unread_only: c.req.query('unread_only') === 'true' ? true : undefined,
    });
    return c.json(await listMoraleInbox(c.get('user'), query));
  });

  app.get('/api/people/v1/morale/inbox/filters', async (c) => {
    const window = moraleInboxQuery
      .pick({ from: true, to: true })
      .catch({})
      .parse({ from: c.req.query('from'), to: c.req.query('to') });
    return c.json(await listMoraleInboxFilters(c.get('user'), window));
  });

  app.get('/api/people/v1/morale/notes/:id', async (c) => {
    return c.json(await getMoraleNote(c.get('user'), c.req.param('id')));
  });

  app.post('/api/people/v1/morale/notes/:id/read', async (c) => {
    await markMoraleNoteRead(c.get('user'), c.req.param('id'));
    return c.body(null, 204);
  });

  app.get('/api/people/v1/morale/trend', async (c) => {
    // Not `.catch({})`: an inverted month range is a question with no honest answer, and
    // the domain rejects it rather than quietly showing a different window than asked for.
    const query = moraleTrendQuery.parse({
      from_month: c.req.query('from_month'),
      to_month: c.req.query('to_month'),
    });
    return c.json(await getMoraleTrend(c.get('user'), query));
  });
}
