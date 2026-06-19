import { defineAgentTool } from '@seta/agent-sdk';
import { z } from 'zod';
import { getDataAccess } from '../domain/data-access.ts';
import { AllocationDataSchema } from '../domain/schemas.ts';
import { resolveSession } from './context.ts';

/** DS01 — resource allocation: account, project, allocation %, overload/bench status. */
export const getAllocationTool = defineAgentTool({
  id: 'performance_getAllocation',
  name: 'Get Allocation',
  description:
    'Get the resource allocation (DS01) for an employee: account, project, allocation %, overload and bench flags.',
  input: z.object({ member_id: z.string().trim().min(1) }),
  output: z.object({ allocation: AllocationDataSchema.nullable() }),
  rbac: 'performance.employee.read',
  execute: async (input, ctx) => {
    const { tenantId } = resolveSession(ctx);
    const allocation = await getDataAccess().getAllocation(tenantId, input.member_id);
    return { allocation };
  },
});
