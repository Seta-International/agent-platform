import { describe, expect, it } from 'vitest';
import {
  closeOpeningInput,
  editRequisitionPatch,
  openRequisitionInput,
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
  it('editRequisitionPatch rejects an unknown status value via stage enum', () => {
    expect(editRequisitionPatch.safeParse({ stage: 'bogus' }).success).toBe(false);
  });
  it('closeOpeningInput requires a valid status', () => {
    expect(closeOpeningInput.safeParse({ status: 'open' }).success).toBe(false);
    expect(closeOpeningInput.safeParse({ status: 'closed' }).success).toBe(true);
  });
});
