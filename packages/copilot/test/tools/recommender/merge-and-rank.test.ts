import { describe, expect, it } from 'vitest';
import { requiredPermissionFor } from '../../../src/backend/tools/_types.ts';
import { recommenderMergeAndRankTool } from '../../../src/backend/tools/recommender/merge-and-rank.ts';
import { makeToolContext } from '../../test-helpers.ts';

const TASK_ID = '00000000-0000-4000-8000-000000000001';
const CTX = makeToolContext({ user_id: '00000000-0000-4000-8000-000000000099' });

const U1 = '00000000-0000-4000-8000-000000000001';
const U2 = '00000000-0000-4000-8000-000000000002';
const U3 = '00000000-0000-4000-8000-000000000003';

const SKILL_CANDIDATES = [
  {
    user_id: U1,
    name: 'Nguyen Van A',
    skills: ['terraform', 'aws', 'kubernetes'],
    role: 'senior_engineer',
    skill_match_count: 3,
    rank: 1,
  },
  {
    user_id: U2,
    name: 'Tran Thi B',
    skills: ['docker', 'ci/cd'],
    role: 'developer',
    skill_match_count: 1,
    rank: 2,
  },
  {
    user_id: U3,
    name: 'Le Van C',
    skills: ['terraform'],
    role: 'developer',
    skill_match_count: 1,
    rank: 3,
  },
];

const AVAILABILITY_RESULTS = [
  { user_id: U1, name: 'Nguyen Van A', status: 'available' as const, in_progress_tasks: [] },
  { user_id: U2, name: 'Tran Thi B', status: 'ooo' as const, in_progress_tasks: [] },
  {
    user_id: U3,
    name: 'Le Van C',
    status: 'busy' as const,
    in_progress_tasks: [{ task_id: 'task-abc', priority: 'medium' as const }],
  },
];

type Recommendation = {
  user_id: string;
  user_name: string | null;
  skill_match: string[];
  skill_match_count: number;
  in_progress_tasks: { task_id: string; priority: string }[];
  status: string;
};

describe('recommender_mergeAndRank tool', () => {
  it('ranks by skill_match_count DESC first', async () => {
    const out = (await recommenderMergeAndRankTool.execute!(
      {
        task_id: TASK_ID,
        required_skills: ['Terraform', 'AWS', 'Kubernetes'],
        skill_candidates: SKILL_CANDIDATES,
        availability_results: AVAILABILITY_RESULTS,
      },
      CTX,
    )) as { recommendations: Recommendation[]; total: number };

    expect(out.recommendations[0]!.user_id).toBe(U1);
    expect(out.recommendations[0]!.skill_match_count).toBe(3);
    expect(out.total).toBe(3);
  });

  it('breaks skill_match_count ties by availability status (available > busy > ooo)', async () => {
    // U2 (ooo) and U3 (busy) both have skill_match_count 1
    const out = (await recommenderMergeAndRankTool.execute!(
      {
        task_id: TASK_ID,
        required_skills: ['Terraform', 'AWS', 'Kubernetes'],
        skill_candidates: SKILL_CANDIDATES,
        availability_results: AVAILABILITY_RESULTS,
      },
      CTX,
    )) as { recommendations: Recommendation[] };

    const ids = out.recommendations.map((r) => r.user_id);
    // U3 (busy=1) should beat U2 (ooo=0) when both have skill_match_count=1
    expect(ids.indexOf(U3)).toBeLessThan(ids.indexOf(U2));
  });

  it('skill_match contains only skills matching required_skills', async () => {
    const out = (await recommenderMergeAndRankTool.execute!(
      {
        task_id: TASK_ID,
        required_skills: ['Terraform', 'AWS'],
        skill_candidates: SKILL_CANDIDATES,
        availability_results: AVAILABILITY_RESULTS,
      },
      CTX,
    )) as { recommendations: Recommendation[] };

    const u1 = out.recommendations.find((r) => r.user_id === U1)!;
    // U1 has terraform, aws, kubernetes — only terraform and aws match
    expect(u1.skill_match.sort()).toEqual(['aws', 'terraform']);
    expect(u1.skill_match).not.toContain('kubernetes');
  });

  it('includes users present in only one source with safe defaults', async () => {
    const out = (await recommenderMergeAndRankTool.execute!(
      {
        task_id: TASK_ID,
        required_skills: ['Terraform'],
        skill_candidates: [
          // U4 only in skill_candidates, not in availability
          {
            user_id: '00000000-0000-4000-8000-000000000004',
            name: 'Extra User',
            skills: ['terraform'],
            role: null,
            skill_match_count: 1,
            rank: 4,
          },
        ],
        availability_results: AVAILABILITY_RESULTS,
      },
      CTX,
    )) as { recommendations: Recommendation[] };

    const u4 = out.recommendations.find(
      (r) => r.user_id === '00000000-0000-4000-8000-000000000004',
    );
    expect(u4).toBeDefined();
    expect(u4!.in_progress_tasks).toEqual([]);
    expect(u4!.status).toBe('busy'); // default when not in availability source
  });

  it('passes task_id through to output', async () => {
    const out = (await recommenderMergeAndRankTool.execute!(
      {
        task_id: TASK_ID,
        required_skills: ['Terraform'],
        skill_candidates: SKILL_CANDIDATES,
        availability_results: AVAILABILITY_RESULTS,
      },
      CTX,
    )) as { task_id: string };

    expect(out.task_id).toBe(TASK_ID);
  });

  it('is registered with permission planner.task.read', () => {
    expect(requiredPermissionFor(recommenderMergeAndRankTool)).toBe('planner.task.read');
  });
});
