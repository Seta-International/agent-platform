import { defineAgentTool } from '@seta/agent-sdk';
import { z } from 'zod';
import { getDataAccess } from '../domain/data-access.ts';
import { PerformanceDataSchema } from '../domain/schemas.ts';
import { resolveSession } from './context.ts';

/** DS02 — monthly KPI scores, classifications, feedback categories. */
export const getPerformanceDataTool = defineAgentTool({
  id: 'performance_getPerformanceData',
  name: 'Get Performance Data',
  description:
    'Get monthly performance rows (DS02) for an employee: KPI score, classification, feedback categories, trend. Optionally filter to one period.',
  input: z.object({
    member_id: z.string().trim().min(1),
    period: z.string().trim().min(1).optional().describe('e.g. "2026-04". Omit for all periods.'),
  }),
  output: z.object({ rows: z.array(PerformanceDataSchema).nullable() }),
  rbac: 'performance.employee.read',
  execute: async (input, ctx) => {
    const { tenantId } = resolveSession(ctx);
    const rows = await getDataAccess().getPerformanceData(tenantId, input.member_id, input.period);
    return { rows };
  },
});
