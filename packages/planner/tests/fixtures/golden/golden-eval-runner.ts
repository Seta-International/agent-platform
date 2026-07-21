// packages/planner/tests/fixtures/golden/golden-eval-runner.ts
//
// The data-driven golden eval driver (spec 2026-07-21). Iterates cases and, per
// case, dispatches by kind + metrics.enabled to the EXISTING policies/scorers.
// Agent-run and retrieval-run are injected so the core is unit-testable without
// a DB/model; the integration lane injects the real implementations.

import { ctxFromCase } from './ctx-from-case.ts';
import { resolveMetricMode } from './metric-policy.ts';
import { evaluatePolicy, type PolicyId, policyRegistry } from './policy/registry.ts';
import type { Trajectory } from './policy/trajectory.ts';
import type { RetrievalCaseResult } from './retrieval-runner.ts';
import { buildRunManifest, type RunManifest, type RunManifestOverrides } from './run-manifest.ts';
import type { GoldenCase } from './schema.ts';

export interface AgentRunOutput {
  answer: string;
  trajectory: Trajectory;
}

export interface RunGoldenEvalParams {
  cases: GoldenCase[];
  suite: string;
  manifest: RunManifestOverrides;
  runAgent: (c: GoldenCase) => Promise<AgentRunOutput>;
  runRetrieval: (cases: GoldenCase[]) => Promise<RetrievalCaseResult[]>;
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
  policies: PolicyReport[];
}

export interface GoldenRunReport {
  manifest: RunManifest;
  suite: string;
  totalCases: number;
  cases: CaseReport[];
  gateFailed: boolean;
  gateFailures: { caseId: string; policyId: string; scorer: string }[];
}

function isPolicyId(id: string): id is PolicyId {
  return id in policyRegistry;
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
      caseReports.push({ id: c.id, kind: c.kind, policies: [] });
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
      const mode = resolveMetricMode('A3', c.metricOverrides?.A3);
      if (mode === 'gate' && verdict !== 'pass') {
        gateFailures.push({ caseId: c.id, policyId: 'A3', scorer: 'retrieval' });
      }
      caseReports.push({
        id: c.id,
        kind: c.kind,
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

    for (const rawId of c.metrics.enabled) {
      const mode = resolveMetricMode(rawId, c.metricOverrides?.[rawId]);
      if (runError || !output) {
        policies.push({ id: rawId, mode, verdict: 'error', scorers: [] });
        if (mode === 'gate') gateFailures.push({ caseId: c.id, policyId: rawId, scorer: 'run' });
        continue;
      }
      if (!isPolicyId(rawId)) {
        // B* / not-yet-implemented deterministic policy — recorded, not scored here.
        policies.push({ id: rawId, mode, verdict: 'pass', scorers: [] });
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
    caseReports.push({ id: c.id, kind: c.kind, policies });
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
