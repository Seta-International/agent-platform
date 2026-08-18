// packages/planner/tests/fixtures/golden/golden-eval-runner.ts
//
// The data-driven golden eval driver (spec 2026-07-21). Iterates cases and, per
// case, dispatches by kind + metrics.enabled to the EXISTING policies/scorers.
// Agent-run and retrieval-run are injected so the core is unit-testable without
// a DB/model; the integration lane injects the real implementations.

import { ctxFromCase, ctxFromTurn, type TurnResult } from './ctx-from-case.ts';
import { resolveMetricMode } from './metric-policy.ts';
import { evaluatePolicy, type PolicyId, policyRegistry } from './policy/registry.ts';
import type { ToolCall, Trajectory } from './policy/trajectory.ts';
import type { RetrievalCaseResult } from './retrieval-runner.ts';
import { buildRunManifest, type RunManifest, type RunManifestOverrides } from './run-manifest.ts';
import type { GoldenCase } from './schema.ts';

export interface AgentRunOutput {
  answer: string;
  trajectory: Trajectory;
}

/** One LLM-judge scorer outcome for an advisory (B*) metric. */
export interface JudgeScorerResult {
  id: string;
  score: number;
  threshold: number;
  passed: boolean;
  reason?: string;
}

export interface RunGoldenEvalParams {
  cases: GoldenCase[];
  suite: string;
  manifest: RunManifestOverrides;
  runAgent: (c: GoldenCase) => Promise<AgentRunOutput>;
  runRetrieval: (cases: GoldenCase[]) => Promise<RetrievalCaseResult[]>;
  /** Optional LLM-as-judge for advisory B* metrics. The caller owns the mapping
   *  from each B* id to its judge scorers; results are recorded, never gated.
   *  Absent ⇒ B* metrics stay recorded-only (verdict pass, no scorers). */
  runJudge?: (
    c: GoldenCase,
    output: AgentRunOutput,
    metricIds: string[],
  ) => Promise<Record<string, JudgeScorerResult[]>>;
  /** Runs a `kind: conversation` case and returns one result per turn, in order.
   *  Absent ⇒ conversation cases are reported as `skipped` rather than silently
   *  passing, which is what they did before FUT-827. */
  runConversation?: (c: GoldenCase) => Promise<ConversationRunOutput>;
  /** Which agent config resolves metric modes. Defaults to planner-query's. */
  metricConfigUrl?: URL;
}

export interface ConversationRunOutput {
  turns: TurnResult[];
  /** The case with every `fixtures.*` reference resolved. `runGoldenEval` scores
   *  against THIS, not the file, because the ids only exist at run time. */
  resolvedCase?: GoldenCase;
  /** Set when the case broke PART WAY through. `turns` then holds the turns that
   *  did complete: the evidence for which turn went wrong lives in them, and
   *  throwing would have discarded it. */
  error?: string;
}

export interface PolicyReport {
  id: string;
  mode: 'gate' | 'advisory';
  verdict: 'pass' | 'fail' | 'error';
  scorers: { id: string; passed: boolean; detail: string }[];
}

export interface CaseReport {
  id: string;
  kind: GoldenCase['kind'];
  /** The user-facing question (agent: last user message; retrieval: query). */
  question?: string;
  /** The agent's answer text (agent cases only). */
  answer?: string;
  /** The captured two-tier tool trajectory (agent cases only). */
  trajectory?: ToolCall[];
  /** Conversation cases only: one entry per turn, so a failing turn is triagable
   *  from the artifact without re-running. */
  turns?: {
    index: number;
    answer: string;
    trajectory: ToolCall[];
    observed?: { rowsChanged: number; mismatches: string[]; changedKeys?: string[] };
  }[];
  /** Set when the case was not evaluated at all, with the reason. */
  skipped?: string;
  /** Why the run seam threw. Without it an unreachable model and a broken agent
   *  produce the same all-`error` report, and the first triage step is a guess. */
  runError?: string;
  policies: PolicyReport[];
}

export interface GoldenRunReport {
  manifest: RunManifest;
  suite: string;
  totalCases: number;
  cases: CaseReport[];
  gateFailed: boolean;
  gateFailures: { caseId: string; policyId: string; scorer: string }[];
  /** Per-metric pass rates. Attached by the caller (the A2 lane), not computed
   *  here: the runner stays agent-agnostic and A1's report shape is unchanged. */
  metricRates?: {
    id: string;
    mode: 'gate' | 'advisory';
    evaluated: number;
    passed: number;
    rate: number;
    threshold: number;
    missedCases: string[];
  }[];
}

function isPolicyId(id: string): id is PolicyId {
  return id in policyRegistry;
}

/** Human-readable question for a case: last user message (agent) or the query
 *  (retrieval); conversation cases use the last turn's last user message. */
function questionOf(c: GoldenCase): string | undefined {
  if (c.kind === 'retrieval') return c.query;
  if (c.kind === 'agent') {
    const msgs = c.input.messages;
    return msgs[msgs.length - 1]?.content;
  }
  if (c.kind === 'conversation') {
    // The last turn may be a DECISION, which has no text; the question a reader
    // wants is the last thing the user actually said.
    for (let i = c.turns.length - 1; i >= 0; i -= 1) {
      const turn = c.turns[i]!;
      if ('user' in turn) return turn.user;
    }
    return undefined;
  }
  return undefined;
}

export async function runGoldenEval(params: RunGoldenEvalParams): Promise<GoldenRunReport> {
  const manifest = buildRunManifest(params.manifest);
  const caseReports: CaseReport[] = [];
  const gateFailures: GoldenRunReport['gateFailures'] = [];

  // Retrieval cases scored in one batch by the injected runner.
  const retrievalCases = params.cases.filter((c) => c.kind === 'retrieval');
  const retrievalResults = retrievalCases.length ? await params.runRetrieval(retrievalCases) : [];
  const retrievalById = new Map(retrievalResults.map((r) => [r.id, r]));

  for (const c of params.cases) {
    if (c.kind === 'conversation') {
      if (!params.runConversation) {
        // Reported, never silently passed: a corpus whose cases are skipped must
        // LOOK skipped in the artifact.
        caseReports.push({
          id: c.id,
          kind: c.kind,
          question: questionOf(c),
          skipped: 'no runConversation seam supplied',
          policies: [],
        });
        continue;
      }

      let run: ConversationRunOutput | null = null;
      let runError: string | undefined;
      try {
        run = await params.runConversation(c);
      } catch (err) {
        runError = err instanceof Error ? err.message : String(err);
      }
      // A partial run reports its own error and keeps its completed turns.
      if (run?.error) runError = run.error;

      const policies: PolicyReport[] = [];
      for (const rawId of c.metrics?.enabled ?? []) {
        const mode = resolveMetricMode(rawId, c.metricOverrides?.[rawId], params.metricConfigUrl);
        if (runError || !run) {
          policies.push({ id: rawId, mode, verdict: 'error', scorers: [] });
          if (mode === 'gate') gateFailures.push({ caseId: c.id, policyId: rawId, scorer: 'run' });
          continue;
        }
        if (!isPolicyId(rawId)) {
          // Advisory B* on a conversation case: recorded-only this wave. The judge
          // must score the CARD, never the answer text — a suspended turn has no
          // assembled answer — so it is wired in a later wave, not faked here.
          policies.push({ id: rawId, mode, verdict: 'pass', scorers: [] });
          continue;
        }

        const scorers: PolicyReport['scorers'] = [];
        let verdict: PolicyReport['verdict'] = 'pass';
        let firstFailure: string | undefined;
        // Scored against the RESOLVED case: a predicate that says `fixtures.task`
        // must be compared against the uuid the builder actually minted.
        const scoringCase = run.resolvedCase ?? c;
        run.turns.forEach((result, index) => {
          const outcome = evaluatePolicy(rawId, ctxFromTurn(scoringCase, index, result));
          for (const s of outcome.scorers) {
            const id = `turn${index + 1}:${s.id}`;
            scorers.push({ id, passed: s.outcome.passed, detail: s.outcome.detail });
            if (s.required && !s.outcome.passed && !firstFailure) firstFailure = id;
          }
          // Worst-of across turns: one bad turn fails the metric for the case.
          if (outcome.verdict !== 'pass') verdict = 'fail';
        });
        policies.push({ id: rawId, mode, verdict, scorers });
        if (mode === 'gate' && verdict !== 'pass') {
          gateFailures.push({ caseId: c.id, policyId: rawId, scorer: firstFailure ?? 'unknown' });
        }
      }

      const last = run?.turns[run.turns.length - 1];
      caseReports.push({
        id: c.id,
        kind: c.kind,
        question: questionOf(c),
        answer: last?.answer,
        trajectory: last?.trajectory.toolCalls,
        ...(runError ? { runError } : {}),
        turns: run?.turns.map((t, i) => ({
          index: i + 1,
          answer: t.answer,
          trajectory: t.trajectory.toolCalls,
          observed: t.dbEffects?.observed,
        })),
        policies,
      });
      continue;
    }

    if (c.kind === 'retrieval') {
      const r = retrievalById.get(c.id);
      const scorers = (r?.policy.scorers ?? []).map((s) => ({
        id: s.id,
        passed: s.passed,
        detail: `${s.value}`,
      }));
      const verdict: PolicyReport['verdict'] = r ? r.policy.verdict : 'error';
      const mode = resolveMetricMode('A3', c.metricOverrides?.A3, params.metricConfigUrl);
      if (mode === 'gate' && verdict !== 'pass') {
        gateFailures.push({ caseId: c.id, policyId: 'A3', scorer: 'retrieval' });
      }
      caseReports.push({
        id: c.id,
        kind: c.kind,
        question: questionOf(c),
        policies: [{ id: 'A3', mode, verdict, scorers }],
      });
      continue;
    }

    // agent case
    const policies: PolicyReport[] = [];
    let output: AgentRunOutput | null = null;
    let runError = false;
    try {
      output = await params.runAgent(c);
    } catch {
      runError = true;
    }

    // Batch the advisory LLM-judge call once per case for all its B* metrics.
    const judgeIds = c.metrics.enabled.filter((id) => !isPolicyId(id));
    let judgeResults: Record<string, JudgeScorerResult[]> = {};
    if (output && !runError && judgeIds.length && params.runJudge) {
      try {
        judgeResults = await params.runJudge(c, output, judgeIds);
      } catch {
        // Advisory lane: a judge failure must never gate or abort the run.
        judgeResults = {};
      }
    }

    for (const rawId of c.metrics.enabled) {
      const mode = resolveMetricMode(rawId, c.metricOverrides?.[rawId], params.metricConfigUrl);
      if (runError || !output) {
        policies.push({ id: rawId, mode, verdict: 'error', scorers: [] });
        if (mode === 'gate') gateFailures.push({ caseId: c.id, policyId: rawId, scorer: 'run' });
        continue;
      }
      if (!isPolicyId(rawId)) {
        // Advisory B* metric: record real judge scores when available, else a
        // recorded-only placeholder. Never added to gateFailures (advisory).
        const jr = judgeResults[rawId] ?? [];
        const scorers = jr.map((s) => ({
          id: s.id,
          passed: s.passed,
          detail: `score=${s.score} (>=${s.threshold})${s.reason ? `: ${s.reason}` : ''}`,
        }));
        const verdict: PolicyReport['verdict'] = scorers.length
          ? scorers.every((s) => s.passed)
            ? 'pass'
            : 'fail'
          : 'pass';
        policies.push({ id: rawId, mode, verdict, scorers });
        continue;
      }
      const ctx = ctxFromCase(c, output.trajectory, output.answer);
      const result = evaluatePolicy(rawId, ctx);
      const scorers = result.scorers.map((s) => ({
        id: s.id,
        passed: s.outcome.passed,
        detail: s.outcome.detail,
      }));
      policies.push({ id: rawId, mode, verdict: result.verdict, scorers });
      if (mode === 'gate' && result.verdict !== 'pass') {
        const firstFail = result.scorers.find((s) => s.required && !s.outcome.passed);
        gateFailures.push({ caseId: c.id, policyId: rawId, scorer: firstFail?.id ?? 'unknown' });
      }
    }
    caseReports.push({
      id: c.id,
      kind: c.kind,
      question: questionOf(c),
      answer: output?.answer,
      trajectory: output?.trajectory.toolCalls,
      policies,
    });
  }

  return {
    manifest,
    suite: params.suite,
    totalCases: params.cases.length,
    cases: caseReports,
    gateFailed: gateFailures.length > 0,
    gateFailures,
  };
}
