import { actorFromContext, defineCopilotTool } from '@seta/copilot-sdk';
import { z } from 'zod';

// ──────────────────────────────────────────────────────────────────────────────
// Leave record type
//
// Matches the timesheet table in mock/timesheet.csv:
//   timesheet {
//     leave_id    : text        — record identifier
//     employee_id : uuid        — FK to identity.user
//     start_date  : date        — leave start (ISO "YYYY-MM-DD")
//     end_date    : date        — leave end   (ISO "YYYY-MM-DD")
//     type        : text enum   — 'annual' | 'sick' | 'personal' | 'unpaid'
//     status      : text enum   — 'approved' | 'pending' | 'rejected'
//   }
//
// Phase A: inject mock data via deps.
// Phase B: swap in real DB query or MS Graph Calendar.
// ──────────────────────────────────────────────────────────────────────────────

export type LeaveRecord = {
  leave_id: string;
  employee_id: string;
  start_date: string; // ISO date "YYYY-MM-DD"
  end_date: string; // ISO date "YYYY-MM-DD"
  type: 'annual' | 'sick' | 'personal' | 'unpaid';
  status: 'approved' | 'pending' | 'rejected';
};

// ──────────────────────────────────────────────────────────────────────────────
// Dependency contract
// ──────────────────────────────────────────────────────────────────────────────

export type CheckUserAvailabilityDeps = {
  /**
   * Returns an approved leave record that covers the given date, or null.
   * Query: WHERE employee_id = userId
   *          AND start_date <= date AND end_date >= date
   *          AND status = 'approved'
   * Phase A: return mock data.
   * Phase B: run SELECT against the real timesheet table.
   */
  getActiveLeave: (params: {
    userId: string;
    date: string; // ISO date "YYYY-MM-DD"
  }) => Promise<LeaveRecord | null>;
};

// ──────────────────────────────────────────────────────────────────────────────
// Tool 1 of the AvaiChecker pipeline.
//
// Receives user_id from the Orchestrator queue (SkillMatcher output).
// Queries the timesheet table to determine if the user is available today.
// ──────────────────────────────────────────────────────────────────────────────

export function makeAvaiCheckerCheckUserAvailabilityTool(deps: CheckUserAvailabilityDeps) {
  return defineCopilotTool({
    id: 'avaiChecker_checkUserAvailability',
    name: 'Check User Availability',
    description: `
First tool in the AvaiChecker pipeline.

Queries the timesheet table for the given user_id to check their availability
status for today's date.

Returns:
  - user_id       : the queried user
  - date          : today's ISO date (YYYY-MM-DD)
  - status        : 'available' | 'busy' | 'on_leave'
  - note          : optional reason from the timesheet record
  - is_available  : true only when status is 'available'

Call this for each user_id received from the Orchestrator queue.
Pass the result to avaiChecker_buildAvailabilityQueue.
      `.trim(),

    input: z.object({
      user_id: z
        .string()
        .uuid()
        .describe('user_id from the Orchestrator queue payload (SkillMatcher output).'),
      date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional()
        .describe('ISO date to check (YYYY-MM-DD). Defaults to today if not provided.'),
    }),

    // status mirrors identity.user_profile.availability_status enum.
    output: z.object({
      user_id: z.string(),
      date: z.string(),
      status: z.enum(['available', 'busy', 'ooo']),
      note: z.string().nullable(), // leave type if on ooo, e.g. "annual", "sick"
      is_available: z.boolean(),
    }),

    rbac: 'identity.user.read.any',

    execute: async (input, ctx) => {
      actorFromContext(ctx); // enforce authentication

      const today = input.date ?? new Date().toISOString().slice(0, 10);

      const leave = await deps.getActiveLeave({
        userId: input.user_id,
        date: today,
      });

      // Approved leave covering today → ooo; no record → available.
      const status: 'available' | 'busy' | 'ooo' = leave ? 'ooo' : 'available';
      const note: string | null = leave?.type ?? null;

      return {
        user_id: input.user_id,
        date: today,
        status,
        note,
        is_available: status === 'available',
      };
    },
  });
}
