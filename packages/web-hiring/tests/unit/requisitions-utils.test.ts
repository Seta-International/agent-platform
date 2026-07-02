import { describe, expect, it } from 'vitest';
import type { OpenRequisitionsBoard } from '../../src/api/hiring-client.ts';
import { buildScopeNote } from '../../src/pages/utils.ts';

function board(over: Partial<OpenRequisitionsBoard>): OpenRequisitionsBoard {
  return {
    scope: 'scoped',
    scoped_account_names: [],
    scoped_project_names: [],
    requisitions: [],
    ...over,
  };
}

describe('buildScopeNote', () => {
  it('returns null for the unscoped (oversight) board', () => {
    expect(buildScopeNote(board({ scope: 'all' }))).toBeNull();
  });

  it('returns null when data is not yet loaded', () => {
    expect(buildScopeNote(undefined)).toBeNull();
  });

  it('lists account names only', () => {
    expect(buildScopeNote(board({ scoped_account_names: ['Acme'] }))).toBe(
      'Showing requisitions for: Acme',
    );
  });

  it('lists project names only', () => {
    expect(buildScopeNote(board({ scoped_project_names: ['Mobile'] }))).toBe(
      'Showing requisitions for: Mobile',
    );
  });

  it('combines account and project names', () => {
    expect(
      buildScopeNote(board({ scoped_account_names: ['Acme'], scoped_project_names: ['Mobile'] })),
    ).toBe('Showing requisitions for: Acme, Mobile');
  });

  it('falls back to a not-assigned message when scoped but nothing matched', () => {
    expect(buildScopeNote(board({}))).toBe(
      'You are not assigned as Account Manager or Project lead on any active account or project.',
    );
  });
});
