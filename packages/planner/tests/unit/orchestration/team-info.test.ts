import { describe, expect, it } from 'vitest';
import {
  makeQnaTeamInfoAgent,
  TEAM_INFO_TOOL_IDS,
} from '../../../src/backend/orchestration/agents/team-info.ts';

describe('qna teamInfoAgent', () => {
  it('is wired with the group/plan/people toolbox', () => {
    expect(TEAM_INFO_TOOL_IDS).toEqual([
      'planner_listGroupMembers',
      'planner_listPlans',
      'planner_listBuckets',
      'planner_searchGroupMembersBySkills',
    ]);
  });

  it('returns prose via the seam', async () => {
    const spec = makeQnaTeamInfoAgent({
      resolveModel: () => ({}) as never,
      runAgent: async () => ({ text: 'Your group has 5 members.' }),
    });
    expect(spec.id).toBe('planner.qna.teamInfo');
    const res = await spec.run(
      { query: 'how many members' },
      { tenantId: 't1', actorUserId: 'u1' },
    );
    expect(res.result.answer).toContain('members');
  });
});
