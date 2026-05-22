import { describe, expect, it, vi } from 'vitest';
import { requiredPermissionFor } from '../../../src/backend/tools/_types.ts';
import { makeSkillMatcherRankCandidatesTool } from '../../../src/backend/tools/skill-matcher/rank-candidates.ts';
import { makeToolContext } from '../../test-helpers.ts';

const TASK_ID = '00000000-0000-4000-8000-000000000001';
const CALLER_ID = '00000000-0000-4000-8000-000000000099';
const CTX = makeToolContext({ user_id: CALLER_ID });

const ROLE_PRIORITY = { manager: 3, senior_engineer: 2, developer: 1 };
const ENQUEUE_RESPONSE = {
  job_id: 'job-sm-001',
  queue: 'staffing:avai_checker_dispatch',
  enqueued_at: '2026-05-21T09:00:00Z',
};

const CANDIDATES = [
  {
    user_id: '00000000-0000-4000-8000-000000000001',
    name: 'Nguyen Van A',
    skills: ['terraform', 'aws', 'kubernetes'],
    role: 'senior_engineer',
    skill_match_count: 0,
    rank: 0,
  },
  {
    user_id: '00000000-0000-4000-8000-000000000002',
    name: 'Tran Thi B',
    skills: ['docker', 'ci/cd'],
    role: 'developer',
    skill_match_count: 0,
    rank: 0,
  },
  {
    user_id: '00000000-0000-4000-8000-000000000003',
    name: 'Le Van C',
    skills: ['terraform', 'aws'],
    role: 'manager',
    skill_match_count: 0,
    rank: 0,
  },
];

describe('skillMatcher_rankCandidates tool', () => {
  it('computes skill_match_count as intersection with required_skills (case-insensitive)', async () => {
    const tool = makeSkillMatcherRankCandidatesTool({
      rolePriority: ROLE_PRIORITY,
      enqueueForOrchestrator: vi.fn().mockResolvedValue(ENQUEUE_RESPONSE),
    });

    const out = (await tool.execute!(
      {
        task_id: TASK_ID,
        candidates: CANDIDATES,
        required_skills: ['Terraform', 'AWS', 'Kubernetes'],
      },
      CTX,
    )) as { ranked_candidates: { user_id: string; skill_match_count: number; rank: number }[] };

    const byUser = Object.fromEntries(out.ranked_candidates.map((c) => [c.user_id, c]));
    expect(byUser['00000000-0000-4000-8000-000000000001']!.skill_match_count).toBe(3);
    expect(byUser['00000000-0000-4000-8000-000000000002']!.skill_match_count).toBe(0);
    expect(byUser['00000000-0000-4000-8000-000000000003']!.skill_match_count).toBe(2);
  });

  it('sorts by role priority DESC then skill_match_count DESC', async () => {
    const tool = makeSkillMatcherRankCandidatesTool({
      rolePriority: ROLE_PRIORITY,
      enqueueForOrchestrator: vi.fn().mockResolvedValue(ENQUEUE_RESPONSE),
    });

    const out = (await tool.execute!(
      {
        task_id: TASK_ID,
        candidates: CANDIDATES,
        required_skills: ['Terraform', 'AWS', 'Kubernetes'],
      },
      CTX,
    )) as { ranked_candidates: { user_id: string; rank: number }[] };

    // manager (priority 3) ranks first despite fewer skill matches
    expect(out.ranked_candidates[0]!.user_id).toBe('00000000-0000-4000-8000-000000000003');
    // senior_engineer (priority 2) with 3 matches second
    expect(out.ranked_candidates[1]!.user_id).toBe('00000000-0000-4000-8000-000000000001');
    // developer (priority 1) last
    expect(out.ranked_candidates[2]!.user_id).toBe('00000000-0000-4000-8000-000000000002');
  });

  it('assigns 1-based rank in sorted order', async () => {
    const tool = makeSkillMatcherRankCandidatesTool({
      rolePriority: ROLE_PRIORITY,
      enqueueForOrchestrator: vi.fn().mockResolvedValue(ENQUEUE_RESPONSE),
    });

    const out = (await tool.execute!(
      { task_id: TASK_ID, candidates: CANDIDATES, required_skills: ['Terraform'] },
      CTX,
    )) as { ranked_candidates: { rank: number }[] };

    expect(out.ranked_candidates.map((c) => c.rank)).toEqual([1, 2, 3]);
  });

  it('pushes ranked result to Orchestrator with task_id and enqueuedBy', async () => {
    const enqueueForOrchestrator = vi.fn().mockResolvedValue(ENQUEUE_RESPONSE);
    const tool = makeSkillMatcherRankCandidatesTool({
      rolePriority: ROLE_PRIORITY,
      enqueueForOrchestrator,
    });

    await tool.execute!(
      { task_id: TASK_ID, candidates: CANDIDATES, required_skills: ['Terraform'] },
      CTX,
    );

    expect(enqueueForOrchestrator).toHaveBeenCalledWith(
      expect.objectContaining({ task_id: TASK_ID, enqueuedBy: CALLER_ID }),
    );
  });

  it('is registered with permission identity.user.read.any', () => {
    const tool = makeSkillMatcherRankCandidatesTool({
      rolePriority: ROLE_PRIORITY,
      enqueueForOrchestrator: vi.fn(),
    });
    expect(requiredPermissionFor(tool)).toBe('identity.user.read.any');
  });
});
