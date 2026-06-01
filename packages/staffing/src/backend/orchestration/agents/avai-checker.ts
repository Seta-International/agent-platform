import type { AgentResult, SpecializedAgentSpec, TrustEnvelope } from '@seta/agent-sdk';
import type { z } from 'zod';
import type { AvailabilityPort } from '../ports.ts';
import {
  AvaiCheckerInputSchema,
  AvaiCheckerOutputSchema,
  type AvailabilityResult,
  OVERLOAD_THRESHOLD,
  type RankedCandidate,
  STATUS_PRIORITY,
} from '../schemas.ts';

export interface AvaiCheckerDeps {
  availability: AvailabilityPort;
}

type Out = z.infer<typeof AvaiCheckerOutputSchema>;

export function makeAvaiCheckerAgent(
  deps: AvaiCheckerDeps,
): SpecializedAgentSpec<{ taskId: string; candidates: RankedCandidate[] }, Out> {
  return {
    id: 'staffing.avaiChecker',
    description:
      'Checks each candidate’s availability and in-progress load, then ranks by readiness.',
    inputSchema: AvaiCheckerInputSchema,
    outputSchema: AvaiCheckerOutputSchema,
    run: async (input, ctx): Promise<AgentResult<Out>> => {
      const rows = await Promise.all(
        input.candidates.map(async (c) => {
          const [status, count] = await Promise.all([
            deps.availability.status(c.userId, ctx),
            deps.availability.inProgressCount(c.userId, ctx),
          ]);
          return {
            userId: c.userId,
            name: c.name,
            status: status.status,
            inProgressCount: count,
            overloaded: count >= OVERLOAD_THRESHOLD,
          };
        }),
      );

      rows.sort((a, b) => {
        if (a.overloaded !== b.overloaded) return a.overloaded ? 1 : -1; // overloaded last
        return STATUS_PRIORITY[b.status] - STATUS_PRIORITY[a.status];
      });

      const availability: AvailabilityResult[] = rows.map((r) => ({
        userId: r.userId,
        name: r.name,
        status: r.status,
        inProgressCount: r.inProgressCount,
      }));

      const overloaded = rows.filter((r) => r.overloaded).map((r) => r.userId);
      const at = new Date().toISOString();
      const trace = [
        { step: 'availability', detail: `${rows.length} candidates checked`, at },
        ...(overloaded.length
          ? [
              {
                step: 'overload_guard',
                detail: `overloaded (>=${OVERLOAD_THRESHOLD}): ${overloaded.join(', ')}`,
                at,
              },
            ]
          : []),
      ];
      const availableCount = rows.filter((r) => r.status === 'available' && !r.overloaded).length;
      const trust: TrustEnvelope = {
        reasoningTrace: trace,
        evidenceCitations: rows.map((r) => ({
          kind: 'user' as const,
          id: r.userId,
          label: r.name ?? undefined,
        })),
        confidenceScore: rows.length ? availableCount / rows.length : 0,
      };

      return { result: { taskId: input.taskId, availability }, trust };
    },
  };
}
