import { defineAgentTool } from '@seta/agent-sdk';
import { z } from 'zod';
import { getDataAccess } from '../domain/data-access.ts';
import { ViolationSummarySchema } from '../domain/schemas.ts';
import { resolveSession } from './context.ts';

/** DS04c — violation / attitude summary: risk flag, open + critical counts, history. */
export const getViolationsTool = defineAgentTool({
  id: 'performance_getViolations',
  name: 'Get Violations',
  description:
    'Get the violation summary (DS04c) for an employee: risk flag, open case count, critical count, and history.',
  input: z.object({ member_id: z.string().trim().min(1) }),
  output: z.object({ violations: ViolationSummarySchema.nullable() }),
  rbac: 'performance.violation.read',
  execute: async (input, ctx) => {
    const { tenantId } = resolveSession(ctx);
    const violations = await getDataAccess().getViolations(tenantId, input.member_id);
    return { violations };
  },
});
