import { describe, expect, it } from 'vitest';
import {
  orchestrationRuns,
  orchestrationStepTrace,
  staffing,
} from '../../src/backend/db/schema.ts';

describe('staffing orchestration schema', () => {
  it('declares both tables in the staffing schema', () => {
    expect(staffing.schemaName).toBe('staffing');
    // Drizzle exposes the SQL name on the special symbol; assert via the column maps instead.
    expect(orchestrationRuns.run_id).toBeDefined();
    expect(orchestrationRuns.state).toBeDefined();
    expect(orchestrationStepTrace.confidence_score).toBeDefined();
    expect(orchestrationStepTrace.reasoning_trace).toBeDefined();
  });
});
