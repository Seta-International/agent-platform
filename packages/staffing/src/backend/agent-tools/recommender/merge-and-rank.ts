import { defineCopilotTool } from '@seta/copilot-sdk';
import { z } from 'zod';

// ──────────────────────────────────────────────────────────────────────────────
// Final output shape — one record per recommended user.
// ──────────────────────────────────────────────────────────────────────────────

export type RecommendedUser = {
  user_id: string;
  user_name: string | null;
  skill_match: string[];
  skill_match_count: number;
  in_progress_tasks: Array<{
    task_id: string;
    priority: 'urgent' | 'important' | 'medium' | 'low';
  }>;
  status: 'available' | 'busy' | 'ooo';
};

// ──────────────────────────────────────────────────────────────────────────────
// Availability priority for secondary sort.
// ──────────────────────────────────────────────────────────────────────────────

const STATUS_PRIORITY: Record<string, number> = {
  available: 2,
  busy: 1,
  ooo: 0,
};

// ──────────────────────────────────────────────────────────────────────────────
// Sole tool of the Recommender agent.
//
// Merges output from:
//   • Agent 2 (SkillMatcher)  — skill_candidates[]  → skill_match_count, skills
//   • Agent 3 (AvaiChecker)   — availability_results[] → status, in_progress_tasks
//
// Ranking rules (applied in order):
//   1. skill_match_count DESC  — more skill overlap = higher rank
//   2. status priority DESC    — available (2) > busy (1) > on_leave (0)
//
// Users present in only one source are included with zero/defaults for the
// missing side (graceful degradation when sets don't fully overlap).
// ──────────────────────────────────────────────────────────────────────────────

export const recommenderMergeAndRankTool = defineCopilotTool({
  id: 'recommender_mergeAndRank',
  name: 'Merge And Rank Candidates',
  description: `
Sole tool of the Recommender agent.

Combines the ranked candidates from SkillMatcher (Agent 2) and the
availability results from AvaiChecker (Agent 3) into a single final
recommendation list.

Ranking priority:
  1. skill_match_count DESC  — skill overlap takes precedence
  2. availability status DESC — among equal skill matches:
       available > busy > on_leave

Output per user: user_id, user_name, skill_match (matched skills only),
skill_match_count, in_progress_tasks [{ task_id, priority }], status.

Call this once after both Agent 2 and Agent 3 results are in the
Orchestrator queue.
    `.trim(),

  input: z.object({
    task_id: z.string().uuid().describe('Passed through for correlation.'),
    required_skills: z
      .array(z.string())
      .min(1)
      .describe(
        'Skills required by the task — from TaskAnalyzer output in the ' +
          'Orchestrator payload. Used to compute matched skills per user.',
      ),
    skill_candidates: z
      .array(
        z.object({
          user_id: z.string(),
          name: z.string().nullable(),
          skills: z.array(z.string()),
          role: z.string().nullable(),
          skill_match_count: z.number().int(),
          rank: z.number().int(),
        }),
      )
      .min(1)
      .describe('Ranked candidates from skillMatcher_rankCandidates (Agent 2).'),
    availability_results: z
      .array(
        z.object({
          user_id: z.string(),
          name: z.string().nullable(),
          status: z.enum(['available', 'busy', 'ooo']),
          in_progress_tasks: z.array(
            z.object({
              task_id: z.string(),
              priority: z.enum(['urgent', 'important', 'medium', 'low']),
            }),
          ),
        }),
      )
      .min(1)
      .describe('Availability results from avaiChecker_buildAvailabilityQueue (Agent 3).'),
  }),

  output: z.object({
    task_id: z.string(),
    recommendations: z.array(
      z.object({
        user_id: z.string(),
        user_name: z.string().nullable(),
        skill_match: z
          .array(z.string())
          .describe('Skills of this user that match required_skills.'),
        skill_match_count: z.number().int(),
        in_progress_tasks: z.array(
          z.object({
            task_id: z.string(),
            priority: z.enum(['urgent', 'important', 'medium', 'low']),
          }),
        ),
        status: z.enum(['available', 'busy', 'ooo']),
      }),
    ),
    total: z.number().int(),
  }),

  rbac: 'planner.task.read',

  execute: async (input, _ctx) => {
    // Normalise required skills for case-insensitive intersection.
    const requiredSet = new Set(input.required_skills.map((s) => s.toLowerCase()));

    // Build lookup maps.
    const skillMap = new Map(input.skill_candidates.map((c) => [c.user_id, c]));
    const avaiMap = new Map(input.availability_results.map((a) => [a.user_id, a]));

    // Union of all user_ids across both sources.
    const allUserIds = new Set([...skillMap.keys(), ...avaiMap.keys()]);

    const merged: RecommendedUser[] = [];

    for (const uid of allUserIds) {
      const skill = skillMap.get(uid);
      const avai = avaiMap.get(uid);

      // Compute matched skills: intersection of user skills with required_skills.
      const userSkills = skill?.skills ?? [];
      const skill_match = userSkills.filter((s) => requiredSet.has(s.toLowerCase()));
      const skill_match_count = skill?.skill_match_count ?? skill_match.length;

      merged.push({
        user_id: uid,
        user_name: avai?.name ?? skill?.name ?? null,
        skill_match,
        skill_match_count,
        in_progress_tasks: avai?.in_progress_tasks ?? [],
        status: avai?.status ?? 'busy',
      });
    }

    // Sort: skill_match_count DESC → status priority DESC.
    merged.sort((a, b) => {
      if (b.skill_match_count !== a.skill_match_count) {
        return b.skill_match_count - a.skill_match_count;
      }
      return (STATUS_PRIORITY[b.status] ?? 0) - (STATUS_PRIORITY[a.status] ?? 0);
    });

    return {
      task_id: input.task_id,
      recommendations: merged,
      total: merged.length,
    };
  },
});
