import { defineAgentTool } from '@seta/agent-sdk';
import { z } from 'zod';
import { assembleProfile } from '../domain/assemble.ts';
import { evaluateNormRules } from '../domain/norm-engine/index.ts';
import { resolveSession } from './context.ts';

/**
 * Assemble a redacted, audience-shaped report payload for an employee. Audience
 * is taken from the SESSION, never from tool input — a non-HR caller cannot ask
 * for HR-level depth. Sensitive fields are already null from the retrieval
 * boundary; this re-applies the same redaction as defence in depth.
 *
 * This produces the structured data the main agent renders into prose; it is
 * not itself the narrative writer (that is the omitted reportGenerator
 * sub-agent — the main agent does it inline in this draft).
 */
export const formatOutputTool = defineAgentTool({
  id: 'performance_formatOutput',
  name: 'Format Output',
  description:
    'Assemble a redacted, audience-appropriate report payload for an employee (header, scores, timesheet, violations, allocation, NORM result). Returns structured JSON for you to render into prose.',
  input: z.object({
    member_id: z.string().trim().min(1),
    period: z.string().trim().min(1).optional(),
    format: z.enum(['report_json', 'risk_table']).default('report_json'),
  }),
  output: z.object({
    audience: z.enum(['hr', 'leader', 'bod']),
    format: z.enum(['report_json', 'risk_table']),
    report: z.record(z.string(), z.unknown()),
    missingDatasets: z.array(z.string()),
    requiresHumanReview: z.boolean(),
  }),
  rbac: 'performance.norm.read',
  execute: async (input, ctx) => {
    const { tenantId, audience } = resolveSession(ctx);
    const profile = await assembleProfile(tenantId, input.member_id, input.period);
    const norm = evaluateNormRules(profile);

    const employee = profile.employee
      ? audience === 'hr'
        ? profile.employee
        : { ...profile.employee, promotionReadiness: null, salaryBand: null }
      : null;

    // BOD aggregate guardrail: individual names are not surfaced without an
    // explicit drill-down. A single-employee report IS a drill-down, so the name
    // stays; the orchestrator strips names in aggregate (multi-employee) views.
    const report = {
      header: employee,
      performance: profile.performance,
      timesheet: profile.timesheet,
      violations: profile.violations,
      allocation: profile.allocation,
      norm: {
        compositeRiskBaseline: norm.compositeRiskBaseline,
        triggered: norm.layerA.filter((r) => r.triggered),
        classifiedFacts: norm.classifiedFacts,
      },
    };

    const requiresHumanReview =
      norm.compositeRiskBaseline === 'high' || norm.compositeRiskBaseline === 'critical';

    return {
      audience,
      format: input.format,
      report,
      missingDatasets: profile.missingDatasets,
      requiresHumanReview,
    };
  },
});
