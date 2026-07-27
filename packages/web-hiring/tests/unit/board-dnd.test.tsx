import { describe, expect, it, vi } from 'vitest';
import type { CandidateListItem } from '../../src/api/hiring-client.ts';
import { onBoardDragEnd } from '../../src/pages/candidates-page.tsx';

function item(over: Partial<CandidateListItem>): CandidateListItem {
  return {
    application_id: 'a1',
    candidate_id: 'c1',
    name: 'Ada',
    seniority: 'Senior',
    source: 'Ref',
    requisition_id: 'r1',
    requisition_title: 'Backend',
    requisition_status: 'open',
    stage: 'new',
    status: 'active',
    rating: 0,
    version: 9,
    applied_at: '2024-01-01T00:00:00.000Z',
    skills: [],
    required_skills: [],
    fit: { met: 0, required: 0, score: 0, strong: false },
    ...over,
  };
}

describe('onBoardDragEnd', () => {
  it('calls the mutation when dropped on a different active column', () => {
    const mutate = vi.fn();
    const handler = onBoardDragEnd([item({})], mutate);
    handler({
      draggableId: 'a1',
      source: { droppableId: 'new', index: 0 },
      destination: { droppableId: 'screening', index: 0 },
    } as never);
    expect(mutate).toHaveBeenCalledWith({
      application_id: 'a1',
      to: 'screening',
      expected_version: 9,
    });
  });

  it('does nothing when dropped on the Hired column', () => {
    const mutate = vi.fn();
    const handler = onBoardDragEnd([item({})], mutate);
    handler({
      draggableId: 'a1',
      source: { droppableId: 'new', index: 0 },
      destination: { droppableId: 'hired', index: 0 },
    } as never);
    expect(mutate).not.toHaveBeenCalled();
  });
});
