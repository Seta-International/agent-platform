import { describe, expect, it } from 'vitest';
import {
  BUCKET_NAME_TOO_LONG_MESSAGE,
  errorFromPlannerResponse,
  PlannerValidationError,
} from '../../../src/lib/planner-api-errors';

describe('errorFromPlannerResponse', () => {
  it('maps bucket name fieldErrors to a friendly message', () => {
    const err = errorFromPlannerResponse(400, {
      error: 'VALIDATION',
      details: {
        fieldErrors: {
          name: ['Too big: expected string to have <=120 characters'],
        },
      },
    });

    expect(err).toBeInstanceOf(PlannerValidationError);
    expect(err.message).toBe(BUCKET_NAME_TOO_LONG_MESSAGE);
    expect((err as PlannerValidationError).fieldErrors.name).toEqual([
      BUCKET_NAME_TOO_LONG_MESSAGE,
    ]);
  });
});
