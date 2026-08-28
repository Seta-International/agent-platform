import type { SessionEnv } from '@seta/core';
import type { Hono } from 'hono';
import { moraleHistoryQuery, moraleRecipientsQuery, submitMoraleInput } from '../../contracts.ts';
import { listMoraleNotes } from '../domain/list-morale-notes.ts';
import { resolveMoraleRecipients } from '../domain/resolve-morale-recipients.ts';
import { submitMoraleNote } from '../domain/submit-morale-note.ts';

export function registerPeopleMoraleRoutes(app: Hono<SessionEnv>): void {
  // A morale note belongs to the signed-in person, so none of these take a scope param
  // in the RBAC sense. `project_id` here is a *narrowing* hint, not a scope: it picks
  // which of the sender's own projects the TL and AM lists are drawn from, and the
  // server ignores any project they are not actually on.
  //
  // Reading the form is open to every role the nav shows it to. `can_submit` is false
  // only for a login with no employee record, which gets the page's own explanation
  // rather than a 403.
  app.get('/api/people/v1/morale/recipients', async (c) => {
    const session = c.get('user');
    // A malformed project_id in a bookmarked URL falls back to "none chosen" rather than
    // erroring: the picker is still on screen for the sender to correct it.
    const { project_id } = moraleRecipientsQuery
      .catch({})
      .parse({ project_id: c.req.query('project_id') });
    return c.json(await resolveMoraleRecipients(session, session.person_id, project_id ?? null));
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
