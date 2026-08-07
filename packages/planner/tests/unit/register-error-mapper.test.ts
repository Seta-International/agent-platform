import { describe, expect, it } from 'vitest';
import { PlannerError } from '../../src/backend/rbac.ts';
import { plannerErrorMapper } from '../../src/register.ts';

describe('plannerErrorMapper', () => {
  it('maps DUPLICATE_LINK to 409, beside DUPLICATE_REFERENCE', () => {
    const mapped = plannerErrorMapper(
      new PlannerError('DUPLICATE_LINK', 'Those two tasks are already linked that way'),
    );
    expect(mapped).toMatchObject({ status: 409, body: { error: 'DUPLICATE_LINK' } });
  });

  it('still maps DUPLICATE_REFERENCE to 409', () => {
    expect(plannerErrorMapper(new PlannerError('DUPLICATE_REFERENCE', 'x'))).toMatchObject({
      status: 409,
    });
  });

  it('returns null for a non-planner error', () => {
    expect(plannerErrorMapper(new Error('boom'))).toBeNull();
  });
});
