import { describe, expect, it } from 'vitest';
import { PlannerError } from '../../src/backend/rbac.ts';
import { plannerErrorMapper } from '../../src/register.ts';

describe('plannerErrorMapper', () => {
  // Load-bearing now rather than incidental: a duplicate LINK arrives as this
  // code, so the 409 rung is what stops the client seeing a 400 (design §3.2).
  it('maps DUPLICATE_REFERENCE to 409', () => {
    const mapped = plannerErrorMapper(
      new PlannerError('DUPLICATE_REFERENCE', 'Reference with this URL already exists on task'),
    );
    expect(mapped).toMatchObject({ status: 409, body: { error: 'DUPLICATE_REFERENCE' } });
  });

  it('does not carry a DUPLICATE_LINK code any more', () => {
    // @ts-expect-error — retired with planner.task_links (design §12).
    const err = new PlannerError('DUPLICATE_LINK', 'gone');
    expect(plannerErrorMapper(err)).toMatchObject({ status: 400 });
  });

  it('returns null for a non-planner error', () => {
    expect(plannerErrorMapper(new Error('boom'))).toBeNull();
  });
});
