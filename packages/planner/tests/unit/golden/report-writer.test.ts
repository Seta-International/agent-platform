import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import type { GoldenRunReport } from '../../fixtures/golden/golden-eval-runner.ts';
import {
  renderGoldenReportMarkdown,
  writeGoldenReport,
} from '../../fixtures/golden/report-writer.ts';

const report: GoldenRunReport = {
  manifest: {
    agentVersion: 'planner-query',
    promptVersion: 'golden-v2',
    productionModelVersion: 'openai/gpt-4o-mini',
    judgeModelVersion: 'n/a',
    harnessVersion: 'phase-2a',
    datasetVersion: 'v2',
    seedChecksum: 'abc123',
    embeddingModelVersion: 'openai/text-embedding-3-small',
    capturedAt: '2026-07-21T18:40:00.000Z',
  },
  suite: 'smoke',
  totalCases: 2,
  cases: [
    {
      id: 'PQ-001',
      kind: 'agent',
      question: 'What tasks are due this week on board Alpha?',
      answer: 'Here are the tasks…',
      trajectory: [
        {
          agentId: 'planner.query.orchestrator',
          toolName: 'planner_queryTasksAgent',
          args: {},
          ok: true,
        },
        {
          agentId: 'planner.query.taskSearch',
          toolName: 'planner_getTask',
          args: { id: 'x' },
          ok: true,
        },
      ],
      policies: [
        {
          id: 'A1',
          mode: 'gate',
          verdict: 'fail',
          scorers: [
            { id: 'tool_selection', passed: false, detail: 'extraneous tool(s): planner_getTask' },
            { id: 'expected_behavior', passed: true, detail: 'behavior answer' },
          ],
        },
      ],
    },
    {
      id: 'PQ-002',
      kind: 'agent',
      question: 'What should I work on today?',
      answer: 'You should…',
      trajectory: [
        {
          agentId: 'planner.query.orchestrator',
          toolName: 'planner_queryTasksAgent',
          args: {},
          ok: true,
        },
      ],
      policies: [{ id: 'A1', mode: 'gate', verdict: 'pass', scorers: [] }],
    },
  ],
  gateFailed: true,
  gateFailures: [{ caseId: 'PQ-001', policyId: 'A1', scorer: 'tool_selection' }],
};

it('renders markdown with question, answer, tool trajectory, and scorer detail', () => {
  const md = renderGoldenReportMarkdown(report);
  expect(md).toContain('PQ-001');
  expect(md).toContain('What tasks are due this week on board Alpha?');
  expect(md).toContain('Here are the tasks');
  expect(md).toContain('planner_queryTasksAgent');
  expect(md).toContain('planner_getTask');
  // the actionable failure reason must survive
  expect(md).toContain('extraneous tool(s): planner_getTask');
  // gate summary
  expect(md).toContain('gateFailed');
});

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'golden-report-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

it('writes a JSON + MD artifact and returns their paths', () => {
  const { jsonPath, mdPath } = writeGoldenReport(report, dir);
  expect(jsonPath).toContain(dir);
  expect(jsonPath.endsWith('.json')).toBe(true);
  expect(mdPath.endsWith('.md')).toBe(true);
  // filename carries the suite so runs are distinguishable
  expect(jsonPath).toContain('smoke');

  const parsed = JSON.parse(readFileSync(jsonPath, 'utf8')) as GoldenRunReport;
  expect(parsed.gateFailures[0]!.caseId).toBe('PQ-001');
  expect(parsed.cases[0]!.trajectory?.[1]?.toolName).toBe('planner_getTask');

  const md = readFileSync(mdPath, 'utf8');
  expect(md).toContain('extraneous tool(s): planner_getTask');
});

// --- FUT-827: conversation rendering -------------------------------------------

const a2Manifest = {
  agentVersion: 'planner-action',
  promptVersion: 'a2-v1',
  productionModelVersion: 'mock',
  judgeModelVersion: 'mock',
  harnessVersion: 'a2',
  datasetVersion: 'v1',
  seedChecksum: 'abc',
  embeddingModelVersion: 'e1',
  capturedAt: '2026-08-17T00:00:00.000Z',
};

it('renders a conversation case turn by turn', () => {
  const md = renderGoldenReportMarkdown({
    manifest: a2Manifest,
    suite: 'smoke',
    totalCases: 1,
    gateFailed: false,
    gateFailures: [],
    cases: [
      {
        id: 'RV-008',
        kind: 'conversation',
        question: 'À thôi 19/8',
        turns: [
          {
            index: 1,
            answer: 'preview',
            trajectory: [],
            observed: { rowsChanged: 0, mismatches: [] },
          },
          {
            index: 2,
            answer: 'revised',
            trajectory: [],
            observed: { rowsChanged: 0, mismatches: [] },
          },
          {
            index: 3,
            answer: 'done',
            trajectory: [],
            observed: { rowsChanged: 1, mismatches: [] },
          },
        ],
        policies: [{ id: 'M3', mode: 'gate', verdict: 'pass', scorers: [] }],
      },
    ],
  });
  expect(md).toContain('Turn 1');
  expect(md).toContain('Turn 3');
  expect(md).toContain('rowsChanged: 1');
});

it('marks a skipped case rather than showing it as a pass', () => {
  const md = renderGoldenReportMarkdown({
    manifest: a2Manifest,
    suite: 'smoke',
    totalCases: 1,
    gateFailed: false,
    gateFailures: [],
    cases: [
      {
        id: 'RV-001',
        kind: 'conversation',
        skipped: 'no runConversation seam supplied',
        policies: [],
      },
    ],
  });
  expect(md).toContain('skipped');
});

it('renders a per-metric rate table when the lane attached one', () => {
  const md = renderGoldenReportMarkdown({
    manifest: a2Manifest,
    suite: 'regression',
    totalCases: 2,
    gateFailed: true,
    gateFailures: [],
    cases: [],
    metricRates: [
      {
        id: 'M1',
        mode: 'gate',
        evaluated: 2,
        passed: 1,
        rate: 0.5,
        threshold: 0.9,
        missedCases: ['MU-002'],
      },
      { id: 'M3', mode: 'gate', evaluated: 1, passed: 1, rate: 1, threshold: 1, missedCases: [] },
    ],
  } as never);
  expect(md).toContain('## Metric pass rates');
  expect(md).toContain('| M1 | gate | 1 | 2 | 0.50 | 0.90 | MU-002 |');
  // A metric that missed nothing renders an em dash, not an empty cell.
  expect(md).toContain('| M3 | gate | 1 | 1 | 1.00 | 1.00 | — |');
});

it('omits the rate table entirely on an A1 report, which never carries one', () => {
  const md = renderGoldenReportMarkdown({
    manifest: a2Manifest,
    suite: 'smoke',
    totalCases: 0,
    gateFailed: false,
    gateFailures: [],
    cases: [],
  } as never);
  expect(md).not.toContain('Metric pass rates');
});

it('prints the per-metric error count and an infrastructure-errors section', () => {
  const withErrors = {
    manifest: {
      capturedAt: '2026-08-25T00-00-00-000Z',
      productionModelVersion: 'llamacpp/qwen3.5-9b',
      judgeModelVersion: 'openai/gpt-5-mini',
      datasetVersion: '2.0.0',
      seedChecksum: 'abc',
    },
    suite: 'regression',
    totalCases: 25,
    gateFailed: false,
    gateFailures: [],
    infraErrors: [{ caseId: 'RV-008', reason: 'CIRCUIT_OPEN planner_updateTask' }],
    metricRates: [
      {
        id: 'M3',
        mode: 'gate',
        passed: 24,
        evaluated: 24,
        rate: 1,
        threshold: 1,
        missedCases: [],
        errors: 1,
        errorCases: ['RV-008'],
      },
    ],
    cases: [],
  } as never;

  const md = renderGoldenReportMarkdown(withErrors);
  // The rate and its missing data sit on the same line: a reader must not have to
  // correlate two tables to know 24/24 was really 24 of 25 cases.
  expect(md).toContain('| M3 | gate | 24 | 24 | 1.00 | 1.00 | — | 1 |');
  expect(md).toContain('## Infrastructure errors');
  expect(md).toContain('RV-008');
  expect(md).toContain('CIRCUIT_OPEN planner_updateTask');
});

it('omits the infrastructure-errors section entirely on a clean run', () => {
  const clean = {
    manifest: {
      capturedAt: '2026-08-25T00-00-00-000Z',
      productionModelVersion: 'm',
      judgeModelVersion: 'j',
      datasetVersion: '2.0.0',
      seedChecksum: 'abc',
    },
    suite: 'regression',
    totalCases: 1,
    gateFailed: false,
    gateFailures: [],
    infraErrors: [],
    metricRates: [],
    cases: [],
  } as never;
  expect(renderGoldenReportMarkdown(clean)).not.toContain('## Infrastructure errors');
});
