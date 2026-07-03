import { Agent } from '@mastra/core/agent';
import type { MastraModelConfig } from '@mastra/core/llm';
import type { SpecializedAgentRunCtx } from '@seta/agent-sdk';
import { z } from 'zod';
import { pickModel } from './model.ts';

/** One candidate the reasoner judged: which of THEIR skills fit, and how well (0..1). */
export interface FitJudgment {
  userId: string;
  relevantSkills: string[];
  relevanceScore: number;
}

export interface CandidateSkills {
  userId: string;
  name: string | null;
  skills: string[];
}

export interface SkillFit {
  /** Candidate's own skills (original casing) judged relevant to the required areas. */
  skillMatch: string[];
  /** 0..1 coverage of the required areas. */
  relevanceScore: number;
}

/** Reasoner seam: called ONLY for candidates with zero literal overlap. */
export type FitReasoner = (args: {
  requiredSkills: string[];
  candidates: CandidateSkills[];
}) => Promise<FitJudgment[]>;

const norm = (s: string) => s.trim().toLowerCase();
const clamp01 = (n: number) => (Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0);

/** Candidate skills (original casing) that literally equal a required tag. */
export function literalMatches(candidateSkills: string[], required: string[]): string[] {
  const req = new Set(required.map(norm));
  return candidateSkills.filter((s) => req.has(norm(s)));
}

/** Keep only reasoned skills the candidate actually has; return their real casing. */
function sanitizeRelevant(relevant: string[], candidateSkills: string[]): string[] {
  const byNorm = new Map(candidateSkills.map((s) => [norm(s), s]));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of relevant) {
    const real = byNorm.get(norm(r));
    if (real && !seen.has(real)) {
      seen.add(real);
      out.push(real);
    }
  }
  return out;
}

/**
 * Reasoning fallback: asks an LLM whether a candidate's concrete skills satisfy
 * the (often coarse) required areas — the "is this actually no match?" re-check.
 */
export async function reasonSkillFit(
  resolveModel: () => MastraModelConfig,
  requiredSkills: string[],
  candidates: CandidateSkills[],
  ctx: Pick<SpecializedAgentRunCtx, 'model' | 'abortSignal'>,
): Promise<FitJudgment[]> {
  if (candidates.length === 0) return [];
  // Per-call Agent so the per-turn model override in ctx.model takes effect.
  const agent = new Agent({
    id: 'staffing.skillFit',
    name: 'Skill-fit reasoning',
    instructions: [
      'You assess how well each candidate fits a task, by skill.',
      'Required areas may be coarse (e.g. "infrastructure", "backend", "migrations") while',
      'candidate skills are concrete tools. Reason about which concrete skills satisfy each',
      'required area — e.g. Docker/Terraform/AWS satisfy "infrastructure"; PostgreSQL satisfies',
      '"migrations" and "backend". Do NOT require exact string equality.',
      "For each candidate return relevantSkills (the subset of THAT candidate's skills relevant",
      'to the required areas, copied verbatim from their list — never invent skills) and',
      'relevanceScore (0..1 coverage of the required areas). Use 0 / [] when genuinely unrelated.',
    ].join('\n'),
    model: pickModel(ctx, resolveModel),
  });
  const r = await agent.generate(JSON.stringify({ requiredSkills, candidates }), {
    structuredOutput: {
      schema: z.object({
        candidates: z.array(
          z.object({
            userId: z.string(),
            relevantSkills: z.array(z.string()),
            relevanceScore: z.number(),
          }),
        ),
      }),
    },
    abortSignal: ctx.abortSignal,
  });
  if (!r.object) throw new Error('skill-fit reasoning returned no structured output');
  return r.object.candidates;
}

/**
 * Hybrid skill fit, computed ONCE per candidate pool and reused downstream.
 *
 * Layer 1 — cheap literal overlap (case-insensitive). Confident matchers never
 * touch the LLM. Layer 2 — reasoning fallback, batched over ONLY the candidates
 * with zero literal overlap (the coarse-tag vs concrete-skill vocabulary gap).
 */
export async function computeSkillFit(args: {
  candidates: CandidateSkills[];
  required: string[];
  ctx: Pick<SpecializedAgentRunCtx, 'model' | 'abortSignal'>;
  resolveModel: () => MastraModelConfig;
  /** Test seam; production runs reasonSkillFit. */
  reasoner?: FitReasoner;
}): Promise<Map<string, SkillFit>> {
  const { candidates, required } = args;
  const out = new Map<string, SkillFit>();
  const needReasoning: CandidateSkills[] = [];

  for (const c of candidates) {
    const hits = literalMatches(c.skills, required);
    if (hits.length > 0) {
      const tags = new Set(hits.map(norm).filter((s) => required.some((r) => norm(r) === s)));
      out.set(c.userId, {
        skillMatch: hits,
        relevanceScore: required.length ? clamp01(tags.size / required.length) : 0,
      });
    } else {
      needReasoning.push(c);
    }
  }

  if (required.length > 0 && needReasoning.length > 0) {
    const reasoner: FitReasoner =
      args.reasoner ??
      ((a) => reasonSkillFit(args.resolveModel, a.requiredSkills, a.candidates, args.ctx));
    // Best-effort: a reasoning failure degrades to vector-only ranking (empty fit)
    // rather than failing the whole candidate search.
    let byUser = new Map<string, FitJudgment>();
    try {
      const judgments = await reasoner({ requiredSkills: required, candidates: needReasoning });
      byUser = new Map(judgments.map((j) => [j.userId, j]));
    } catch {
      byUser = new Map();
    }
    for (const c of needReasoning) {
      const j = byUser.get(c.userId);
      out.set(c.userId, {
        skillMatch: sanitizeRelevant(j?.relevantSkills ?? [], c.skills),
        relevanceScore: clamp01(j?.relevanceScore ?? 0),
      });
    }
  } else {
    for (const c of needReasoning) out.set(c.userId, { skillMatch: [], relevanceScore: 0 });
  }

  return out;
}
