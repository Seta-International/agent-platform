import { defineAgentTool } from '@seta/agent-sdk';
import { z } from 'zod';
import { getDataAccess } from '../domain/data-access.ts';
import { TimesheetDataSchema } from '../domain/schemas.ts';
import { resolveSession } from './context.ts';

/** DS03 — timesheet rows: OT, attendance, log-work compliance. */
export const getTimesheetTool = defineAgentTool({
  id: 'performance_getTimesheet',
  name: 'Get Timesheet',
  description:
    'Get timesheet rows (DS03) for an employee: OT hours, attendance %, compliance flag, log-work %. Optionally filter to one period.',
  input: z.object({
    member_id: z.string().trim().min(1),
    period: z.string().trim().min(1).optional(),
  }),
  output: z.object({ rows: z.array(TimesheetDataSchema).nullable() }),
  rbac: 'performance.employee.read',
  execute: async (input, ctx) => {
    const { tenantId } = resolveSession(ctx);
    const rows = await getDataAccess().getTimesheet(tenantId, input.member_id, input.period);
    return { rows };
  },
});
