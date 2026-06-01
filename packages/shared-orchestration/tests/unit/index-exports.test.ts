import {
  enqueueRun,
  makeOrchestrationTaskList,
  ORCH_JOBS,
  OrchestrationRegistry,
  runAgent,
  runOrchestrationInline,
} from '@seta/shared-orchestration';
import { describe, expect, it } from 'vitest';

describe('@seta/shared-orchestration public surface', () => {
  it('exports the run-mode entry points and the registry', () => {
    expect(ORCH_JOBS.RUN_STEP).toBe('orchestration:run_step');
    expect(typeof enqueueRun).toBe('function');
    expect(typeof makeOrchestrationTaskList).toBe('function');
    expect(typeof runOrchestrationInline).toBe('function');
    expect(typeof runAgent).toBe('function');
    expect(typeof OrchestrationRegistry.register).toBe('function');
  });
});
