import { describe, expect, it } from 'vitest';
import type { CandidateListItem } from '../../src/api/hiring-client.ts';
import {
  boardColumns,
  fitLabel,
  fitScoreBadge,
  resolveStageDrop,
} from '../../src/pages/candidate-utils.ts';

function item(over: Partial<CandidateListItem>): CandidateListItem {
  return {
    application_id: 'a1',
    candidate_id: 'c1',
    name: 'Ada',
    seniority: 'Senior',
    source: 'Referral',
    requisition_id: 'r1',
    requisition_title: 'Backend Eng',
    requisition_status: 'open',
    stage: 'new',
    status: 'active',
    rating: 0,
    version: 1,
    applied_at: '2024-01-01T00:00:00.000Z',
    skills: [],
    required_skills: [],
    fit: { met: 0, required: 0, score: 0, strong: false },
    ...over,
  };
}

describe('boardColumns', () => {
  it('groups active applications by stage and active hires by Hired', () => {
    const cols = boardColumns([
      item({ application_id: 'a1', stage: 'new', status: 'active' }),
      item({ application_id: 'a2', stage: 'offer', status: 'active' }),
      item({ application_id: 'a3', stage: 'offer', status: 'hired' }),
    ]);
    expect(cols.new.map((i) => i.application_id)).toEqual(['a1']);
    expect(cols.offer.map((i) => i.application_id)).toEqual(['a2']);
    expect(cols.hired.map((i) => i.application_id)).toEqual(['a3']);
  });

  it('omits rejected and transferred applications from the board', () => {
    const cols = boardColumns([
      item({ application_id: 'a4', stage: 'screening', status: 'rejected' }),
      item({ application_id: 'a5', stage: 'interview', status: 'transferred' }),
    ]);
    expect(cols.screening).toHaveLength(0);
    expect(cols.interview).toHaveLength(0);
  });
});

describe('fitLabel', () => {
  it('formats met/required and flags strong', () => {
    expect(fitLabel({ met: 3, required: 4, score: 0.75, strong: false })).toEqual({
      text: '3/4 skills',
      strong: false,
    });
    expect(fitLabel({ met: 0, required: 0, score: 0, strong: false })).toEqual({
      text: 'No skills required',
      strong: false,
    });
    expect(fitLabel({ met: 2, required: 2, score: 1, strong: true })).toEqual({
      text: '2/2 skills',
      strong: true,
    });
  });
});

describe('fitScoreBadge', () => {
  it('bands the score into success/warning/neutral and renders a percentage', () => {
    expect(fitScoreBadge({ met: 0, required: 0, score: 0, strong: false })).toEqual({
      text: '—',
      variant: 'neutral',
    });
    expect(fitScoreBadge({ met: 1, required: 2, score: 0.5, strong: false })).toEqual({
      text: '50%',
      variant: 'neutral',
    });
    expect(fitScoreBadge({ met: 3, required: 4, score: 0.75, strong: false })).toEqual({
      text: '75%',
      variant: 'warning',
    });
    expect(fitScoreBadge({ met: 2, required: 2, score: 1, strong: true })).toEqual({
      text: '100%',
      variant: 'success',
    });
  });
});

describe('resolveStageDrop', () => {
  const items = [item({ application_id: 'a1', stage: 'new', status: 'active', version: 7 })];
  it('returns the move when dropped on a different active column', () => {
    expect(
      resolveStageDrop({ draggableId: 'a1', source: 'new', destination: 'screening', items }),
    ).toEqual({ application_id: 'a1', to: 'screening', expected_version: 7 });
  });
  it('returns null when dropped on the same column', () => {
    expect(
      resolveStageDrop({ draggableId: 'a1', source: 'new', destination: 'new', items }),
    ).toBeNull();
  });
  it('returns null when dropped on the Hired column (offers deferred)', () => {
    expect(
      resolveStageDrop({ draggableId: 'a1', source: 'new', destination: 'hired', items }),
    ).toBeNull();
  });
  it('returns null when there is no destination', () => {
    expect(
      resolveStageDrop({ draggableId: 'a1', source: 'new', destination: null, items }),
    ).toBeNull();
  });
});
