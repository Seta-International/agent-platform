import { Agent } from '@mastra/core/agent';
import type { MastraModelConfig } from '@mastra/core/llm';
import { RequestContext } from '@mastra/core/request-context';
import type { AgentResult, Citation, SpecializedAgentSpec } from '@seta/agent-sdk';
import type { z } from 'zod';
import { pickModel } from '../model.ts';
import type { SkillSearchHit, SkillSearchPort } from '../ports.ts';
import {
  type RankedCandidate,
  SkillMatcherInputSchema,
  SkillMatcherOutputSchema,
} from '../schemas.ts';
import { type MastraToolSignals, trustFromMastraResult } from '../trust.ts';
import { makeSkillMatcherTools } from './skill-matcher.tools.ts';

type Out = z.infer<typeof SkillMatcherOutputSchema>;
type In = z.infer<typeof SkillMatcherInputSchema>;

export interface SkillMatcherDeps {
  skillSearch: SkillSearchPort;
  resolveModel: () => MastraModelConfig;
  topK?: number;
  /** Test-only seam; production builds + runs a real Mastra Agent. */
  runAgent?: (args: { input: In; requestContext: RequestContext }) => Promise<MastraToolSignals>;
}

const INSTRUCTIONS = [
  'You find and rank candidate users for a task by required skills.',
  'ALWAYS call searchCandidates with the required skills, then call rankCandidates',
  'with those hits and the required skills. Never invent people.',
].join(' ');

function toolResult(res: MastraToolSignals, name: string): unknown {
  return res.toolResults.find((t) => t.payload.toolName === name)?.payload.result;
}

export function makeSkillMatcherAgent(deps: SkillMatcherDeps): SpecializedAgentSpec<In, Out> {
  const tools = makeSkillMatcherTools({ skillSearch: deps.skillSearch, topK: deps.topK });

  return {
    id: 'staffing.skillMatcher',
    description: 'Finds and ranks candidate users by skill overlap via vector search (LLM-driven).',
    inputSchema: SkillMatcherInputSchema,
    outputSchema: SkillMatcherOutputSchema,
    run: async (input, ctx): Promise<AgentResult<Out>> => {
      const rc = new RequestContext();
      rc.set('actor', { type: 'user', user_id: ctx.actorUserId });
      rc.set('tenant_id', ctx.tenantId);
      rc.set('effective_permissions', ctx.effectivePermissions ?? new Set<string>());

      const res: MastraToolSignals = deps.runAgent
        ? await deps.runAgent({ input, requestContext: rc })
        : await (async () => {
            // Built per run (not at factory time) so the per-turn model
            // override in ctx.model takes effect.
            const agent = new Agent({
              id: 'staffing.skillMatcher',
              name: 'Skill Matcher',
              instructions: INSTRUCTIONS,
              model: pickModel(ctx, deps.resolveModel),
              tools: tools as never,
            });
            const r = await agent.generate(
              `taskId=${input.taskId}. Required skills: ${input.skills.join(', ')}. Find and rank candidates.`,
              { requestContext: rc, maxSteps: 5, abortSignal: ctx.abortSignal },
            );
            return {
              toolCalls: r.toolCalls as MastraToolSignals['toolCalls'],
              toolResults: r.toolResults as MastraToolSignals['toolResults'],
            };
          })();

      // Authoritative list = rankCandidates result; fall back to ranking the raw hits.
      const ranked = (
        toolResult(res, 'rankCandidates') as { candidates?: RankedCandidate[] } | undefined
      )?.candidates;
      const hits =
        (toolResult(res, 'searchCandidates') as { hits?: SkillSearchHit[] } | undefined)?.hits ??
        [];
      const candidates = ranked ?? fallbackRank(hits, input.skills);

      const trust = trustFromMastraResult(res, {
        citations: (tr) => {
          if (tr.payload.toolName !== 'searchCandidates') return [];
          const hs = (tr.payload.result as { hits?: SkillSearchHit[] }).hits ?? [];
          return hs.map<Citation>((h) => ({
            kind: 'user',
            id: h.userId,
            label: h.name ?? undefined,
            score: h.similarity,
          }));
        },
        confidence: hits.reduce((mx, h) => Math.max(mx, h.similarity), 0),
      });

      return { result: { taskId: input.taskId, candidates }, trust };
    },
  };
}

function fallbackRank(hits: SkillSearchHit[], required: string[]): RankedCandidate[] {
  const have = (skills: string[]) => new Set(skills.map((s) => s.toLowerCase()));
  const byUser = new Map<string, { hit: SkillSearchHit; bestSim: number; skills: Set<string> }>();
  for (const h of hits) {
    const prev = byUser.get(h.userId);
    if (prev) {
      for (const s of h.skills) prev.skills.add(s);
      prev.bestSim = Math.max(prev.bestSim, h.similarity);
    } else byUser.set(h.userId, { hit: h, bestSim: h.similarity, skills: new Set(h.skills) });
  }
  const reqLower = required.map((r) => r.toLowerCase());
  return Array.from(byUser.values())
    .map((m) => {
      const skills = Array.from(m.skills);
      const hv = have(skills);
      return {
        hit: m.hit,
        skills,
        matches: reqLower.filter((r) => hv.has(r)).length,
        bestSim: m.bestSim,
      };
    })
    .sort((a, b) => (b.matches !== a.matches ? b.matches - a.matches : b.bestSim - a.bestSim))
    .map((m, i) => ({
      userId: m.hit.userId,
      name: m.hit.name,
      skills: m.skills,
      role: m.hit.role,
      skillMatchCount: m.matches,
      rank: i + 1,
    }));
}
