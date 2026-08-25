import type { SessionEnv } from '@seta/core';
import type { Hono } from 'hono';
import { moraleHistoryQuery, submitMoraleInput } from '../../contracts.ts';
import { listMoraleNotes } from '../domain/list-morale-notes.ts';
import { resolveMoraleRecipients } from '../domain/resolve-morale-recipients.ts';
import { submitMoraleNote } from '../domain/submit-morale-note.ts';

export function registerPeopleMoraleRoutes(app: Hono<SessionEnv>): void {
  // No scope params on any of these: a morale note belongs to the signed-in person,
  // not to a project.
  //
  // Reading the form is open to every role the nav shows it to — `can_submit` carries the
  // Member / Team Lead gate, so a caller outside those capacities gets the page's own
  // explanation rather than a 403. Submitting is still refused; see `submitMoraleNote`.
  app.get('/api/people/v1/morale/recipients', async (c) => {
    const session = c.get('user');
    return c.json(await resolveMoraleRecipients(session, session.person_id));
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
}
