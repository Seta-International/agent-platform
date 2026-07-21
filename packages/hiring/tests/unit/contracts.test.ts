import { describe, expect, it } from 'vitest';
import {
  addCandidateInput,
  closeOpeningInput,
  editRequisitionPatch,
  openRequisitionInput,
  rejectApplicationInput,
} from '../../src/contracts.ts';

describe('hiring contracts (HIR-2)', () => {
  it('openRequisitionInput defaults headcount to 1 and accepts jd_sections + skills', () => {
    const p = openRequisitionInput.parse({
      title: 'Senior Backend Engineer',
      kind: 'new',
      jd_sections: [{ variant: 'external', section: 'about', body: '<p>hi</p>' }],
      skills: [{ skill_id: crypto.randomUUID(), skill_name: 'Go', min_level: 4 }],
    });
    expect(p.headcount).toBe(1);
    expect(p.skills?.[0]?.skill_name).toBe('Go');
  });
  it('openRequisitionInput validates headcount bounds (1 <= headcount <= 1000)', () => {
    expect(openRequisitionInput.safeParse({ title: 'Dev', headcount: 0 }).success).toBe(false);
    expect(openRequisitionInput.safeParse({ title: 'Dev', headcount: -5 }).success).toBe(false);
    expect(openRequisitionInput.safeParse({ title: 'Dev', headcount: 1.5 }).success).toBe(false);
    expect(openRequisitionInput.safeParse({ title: 'Dev', headcount: 1001 }).success).toBe(false);
    expect(openRequisitionInput.safeParse({ title: 'Dev', headcount: 1000 }).success).toBe(true);
    expect(openRequisitionInput.safeParse({ title: 'Dev', headcount: 1 }).success).toBe(true);
  });
  it('editRequisitionPatch rejects an unknown status value via stage enum', () => {
    expect(editRequisitionPatch.safeParse({ stage: 'bogus' }).success).toBe(false);
  });
  it('closeOpeningInput requires a valid status', () => {
    expect(closeOpeningInput.safeParse({ status: 'open' }).success).toBe(false);
    expect(closeOpeningInput.safeParse({ status: 'closed' }).success).toBe(true);
  });
  it('requires a requisition and a name to add a candidate', () => {
    expect(
      addCandidateInput.safeParse({ name: 'A', requisition_id: crypto.randomUUID() }).success,
    ).toBe(true);
    expect(addCandidateInput.safeParse({ name: 'A' }).success).toBe(false);
  });
  it('requires a free-text reason to reject; the catalog id is optional', () => {
    expect(rejectApplicationInput.safeParse({ reason: 'Not a fit', tags: [] }).success).toBe(true);
    expect(
      rejectApplicationInput.safeParse({
        reason: 'Not a fit',
        reason_id: crypto.randomUUID(),
        tags: [],
      }).success,
    ).toBe(true);
    expect(rejectApplicationInput.safeParse({ tags: [] }).success).toBe(false);
    expect(rejectApplicationInput.safeParse({ reason: '   ', tags: [] }).success).toBe(false);
  });
});
