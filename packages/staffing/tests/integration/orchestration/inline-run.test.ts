import { SpecializedAgentRegistry } from '@seta/agent-sdk';
import { OrchestrationRegistry } from '@seta/shared-orchestration';
import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';
import {
  orchestrationRuns,
  orchestrationStepTrace,
  staffingDb,
} from '../../../src/backend/db/index.ts';
import {
  __setStaffingRunIdForTests,
  buildStaffingOrchestrationRuntime,
} from '../../../src/backend/orchestration/register.ts';
import { StaffingRunStateRepository } from '../../../src/backend/orchestration/run-state-repository.ts';
import { withAgentTestDb } from '../../helpers.ts';

const TENANT = '00000000-0000-4000-8000-0000000000b9';
const ACTOR = '00000000-0000-4000-8000-0000000000c9';
const RUN = '00000000-0000-4000-8000-0000000000d9';

afterEach(() => {
  SpecializedAgentRegistry.__resetForTests();
  OrchestrationRegistry.__resetForTests();
});

describe('assigneeRecommendation inline run (e2e)', () => {
  it('runs analyze→match→avai→recommend, persisting run + 4 traces', async () => {
    await withAgentTestDb(async () => {
      __setStaffingRunIdForTests(() => RUN);
      const rt = buildStaffingOrchestrationRuntime({
        repo: new StaffingRunStateRepository(),
        ports: {
          taskReader: {
            load: async () => ({
              taskId: 'task-1',
              title: 'Stripe webhook',
              description: 'x',
              groupId: 'g1',
            }),
          },
          skillExtractor: {
            extract: async () => ({ actionable: true, skills: ['stripe', 'webhooks'] }),
          },
          skillSearch: {
            search: async () => [
              {
                userId: 'u1',
                name: 'A',
                skills: ['stripe', 'webhooks'],
                role: null,
                similarity: 0.9,
              },
            ],
          },
          availability: {
            status: async () => ({ status: 'available' as const, note: null }),
            inProgressCount: async () => 1,
          },
        },
      });
      SpecializedAgentRegistry.freeze();
      OrchestrationRegistry.freeze();

      const events = [];
      for await (const e of rt.runInline(
        { userText: 'who can take this', taskId: 'task-1' },
        { tenantId: TENANT, actorUserId: ACTOR },
      )) {
        events.push(e);
      }

      const final = events.at(-1) as {
        kind: 'final';
        result: { recommendations: { userId: string }[] };
      };
      expect(final.kind).toBe('final');
      expect(final.result.recommendations[0]!.userId).toBe('u1');

      const [run] = await staffingDb()
        .select()
        .from(orchestrationRuns)
        .where(eq(orchestrationRuns.run_id, RUN));
      expect(run!.status).toBe('completed');

      const traces = await staffingDb()
        .select()
        .from(orchestrationStepTrace)
        .where(eq(orchestrationStepTrace.run_id, RUN));
      expect(traces.map((t) => t.step_id).sort()).toEqual([
        'analyze',
        'avai',
        'match',
        'recommend',
      ]);
    });
  });

  it('early-exits to a single trace when the analyzer is not actionable', async () => {
    await withAgentTestDb(async () => {
      __setStaffingRunIdForTests(() => RUN);
      const rt = buildStaffingOrchestrationRuntime({
        repo: new StaffingRunStateRepository(),
        ports: {
          taskReader: { load: async () => null },
          skillExtractor: {
            extract: async () => ({ actionable: false, skills: [], reason: 'chit-chat' }),
          },
          skillSearch: { search: async () => [] },
          availability: {
            status: async () => ({ status: 'available' as const, note: null }),
            inProgressCount: async () => 0,
          },
        },
      });
      SpecializedAgentRegistry.freeze();
      OrchestrationRegistry.freeze();

      const events = [];
      for await (const e of rt.runInline(
        { userText: 'hello', taskId: null },
        { tenantId: TENANT, actorUserId: ACTOR },
      )) {
        events.push(e);
      }
      expect(events.map((e) => e.kind)).toEqual(['step-start', 'step-done', 'final']);
      const traces = await staffingDb()
        .select()
        .from(orchestrationStepTrace)
        .where(eq(orchestrationStepTrace.run_id, RUN));
      expect(traces).toHaveLength(1);
    });
  });
});
