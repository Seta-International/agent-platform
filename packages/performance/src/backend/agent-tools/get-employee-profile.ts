import { defineAgentTool } from '@seta/agent-sdk';
import { z } from 'zod';
import { getDataAccess } from '../domain/data-access.ts';
import { EmployeeProfileSchema } from '../domain/schemas.ts';
import { resolveSession } from './context.ts';

/**
 * DS00 employee master record.
 *
 * RBAC redaction happens HERE, at the retrieval boundary — not in a later
 * format step. `promotionReadiness` and `salaryBand` are nulled out for any
 * audience other than HR, so the LLM context never receives values it must not
 * surface. (This is the fix called out in the design review: redact before the
 * report-generating LLM runs, not after.)
 */
export const getEmployeeProfileTool = defineAgentTool({
  id: 'performance_getEmployeeProfile',
  name: 'Get Employee Profile',
  description: 'Get an employee master record (DS00): role, level, status, tenure, tier, score.',
  input: z.object({
    member_id: z.string().trim().min(1).describe('Employee id, e.g. "EMP-031".'),
  }),
  output: z.object({ profile: EmployeeProfileSchema.nullable() }),
  rbac: 'performance.employee.read',
  execute: async (input, ctx) => {
    const { tenantId, audience } = resolveSession(ctx);
    const profile = await getDataAccess().getEmployeeProfile(tenantId, input.member_id);
    if (!profile) return { profile: null };

    if (audience !== 'hr') {
      return { profile: { ...profile, promotionReadiness: null, salaryBand: null } };
    }
    return { profile };
  },
});
