import { defineAgentTool } from '@seta/agent-sdk';
import { z } from 'zod';
import { assembleProfile } from '../domain/assemble.ts';
import { evaluateNormRules } from '../domain/norm-engine/index.ts';
import { NormResultSchema } from '../domain/schemas.ts';
import { resolveSession } from './context.ts';

/**
 * Two-layer NORM evaluation. This draft runs Layer A (deterministic threshold
 * rules) and a deterministic composite baseline. Layer B (LLM composite
 * reasoning) is omitted — the main agent reasons about composite risk from
 * `classifiedFacts`, which expose classifications only, never raw numbers.
 *
 * Takes `member_id` and assembles the profile server-side so the engine
 * evaluates true source data rather than an LLM-relayed snapshot.
 */
export const evaluateNormTool = defineAgentTool({
  id: 'performance_evaluateNorm',
  name: 'Evaluate NORM Rules',
  description:
    'Apply the deterministic NORM rules to an employee and return the triggered classifications plus a composite-risk baseline. Use the returned classifications when reasoning about risk — do not re-derive thresholds from raw scores yourself.',
  input: z.object({
    member_id: z.string().trim().min(1),
    period: z.string().trim().min(1).optional(),
  }),
  output: NormResultSchema.extend({ missingDatasets: z.array(z.string()) }),
  rbac: 'performance.norm.read',
  execute: async (input, ctx) => {
    const { tenantId } = resolveSession(ctx);
    const profile = await assembleProfile(tenantId, input.member_id, input.period);
    const result = evaluateNormRules(profile);
    return { ...result, missingDatasets: profile.missingDatasets };
  },
});
