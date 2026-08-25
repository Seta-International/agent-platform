// packages/planner/tests/fixtures/golden/report-writer.ts
//
// Persists a GoldenRunReport as diagnostic artifacts: a machine-readable JSON
// (full fidelity — trajectory, answer, per-scorer detail) plus a human-readable
// Markdown summary. The JSON is the source of truth; the MD is a rendered view
// so a failing case can be triaged without a JSON viewer. Pure + filesystem only;
// no DB/model.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CaseReport, GoldenRunReport } from './golden-eval-runner.ts';

function verdictOf(cr: CaseReport): 'pass' | 'fail' | 'error' | 'n/a' | 'skipped' {
  if (cr.skipped) return 'skipped';
  if (cr.policies.length === 0) return 'n/a';
  if (cr.policies.some((p) => p.verdict === 'error')) return 'error';
  if (cr.policies.some((p) => p.verdict === 'fail')) return 'fail';
  return 'pass';
}

const ICON: Record<string, string> = {
  pass: '✅',
  fail: '❌',
  error: '💥',
  'n/a': '➖',
  skipped: '⏭️',
};

function renderCase(cr: CaseReport): string {
  const v = verdictOf(cr);
  const lines: string[] = [];
  lines.push(`### ${ICON[v]} ${cr.id} — ${v} (${cr.kind})`);
  if (cr.question) lines.push(`- **Question:** ${cr.question}`);
  if (cr.answer !== undefined) lines.push(`- **Answer:** ${cr.answer || '(empty)'}`);
  if (cr.skipped) lines.push(`- **Skipped:** ${cr.skipped}`);
  if (cr.runError) lines.push(`- **Run error:** ${cr.runError}`);

  for (const turn of cr.turns ?? []) {
    lines.push(`- **Turn ${turn.index}:** ${turn.answer || '(no text)'}`);
    if (turn.observed) {
      lines.push(
        `  - rowsChanged: ${turn.observed.rowsChanged}` +
          (turn.observed.changedKeys?.length ? ` (${turn.observed.changedKeys.join(', ')})` : '') +
          (turn.observed.mismatches.length ? ` ⚠️ ${turn.observed.mismatches.join('; ')}` : ''),
      );
    }
    for (const t of turn.trajectory) {
      lines.push(
        `  - \`${t.toolName}\`${t.ok ? '' : ' ⚠️error'} — args: \`${JSON.stringify(t.args)}\``,
      );
    }
  }

  if (cr.trajectory?.length) {
    lines.push('- **Trajectory:**');
    for (const t of cr.trajectory) {
      const flag = t.ok ? '' : ' ⚠️error';
      lines.push(
        `  - \`${t.toolName}\` (${t.agentId})${flag} — args: \`${JSON.stringify(t.args)}\``,
      );
    }
  } else if (cr.kind === 'agent') {
    lines.push('- **Trajectory:** (no tools called)');
  }

  for (const p of cr.policies) {
    lines.push(`- **${p.id}** [${p.mode}] → ${ICON[p.verdict]} ${p.verdict}`);
    for (const s of p.scorers) {
      lines.push(`  - ${s.passed ? '✓' : '✗'} \`${s.id}\`: ${s.detail}`);
    }
  }
  return lines.join('\n');
}

export function renderGoldenReportMarkdown(report: GoldenRunReport): string {
  const m = report.manifest;
  const header = [
    `# Golden eval report — suite: ${report.suite}`,
    '',
    `- **capturedAt:** ${m.capturedAt}`,
    `- **model:** ${m.productionModelVersion} · **judge:** ${m.judgeModelVersion}`,
    `- **dataset:** ${m.datasetVersion} · **seedChecksum:** ${m.seedChecksum}`,
    `- **totalCases:** ${report.totalCases} · **gateFailed:** ${report.gateFailed} · **failures:** ${report.gateFailures.length} · **infraErrors:** ${report.infraErrors?.length ?? 0}`,
    '',
  ].join('\n');

  const failSummary = report.gateFailures.length
    ? [
        '## Gate failures',
        '',
        ...report.gateFailures.map((f) => `- ${f.caseId} · ${f.policyId} · scorer \`${f.scorer}\``),
        '',
      ].join('\n')
    : '';

  // Absent on every A1 report, where the block collapses to '' and changes nothing.
  const rates = report.metricRates?.length
    ? [
        '## Metric pass rates',
        '',
        '| metric | mode | passed | evaluated | rate | threshold | missed | errors |',
        '| --- | --- | --- | --- | --- | --- | --- | --- |',
        ...report.metricRates.map(
          (r) =>
            `| ${r.id} | ${r.mode} | ${r.passed} | ${r.evaluated} | ${r.rate.toFixed(2)} | ` +
            `${r.threshold.toFixed(2)} | ${r.missedCases.join(', ') || '—'} | ${r.errors} |`,
        ),
        '',
      ].join('\n')
    : '';

  // A case excluded from the rates but absent from the artifact would be the worse
  // bug: an honest denominator with an invisible reason.
  const infra = report.infraErrors?.length
    ? [
        '## Infrastructure errors',
        '',
        '_Excluded from every metric denominator — these cases were not measured._',
        '',
        ...report.infraErrors.map((e) => `- ${e.caseId} — ${e.reason}`),
        '',
      ].join('\n')
    : '';

  const cases = ['## Cases', '', ...report.cases.map(renderCase)].join('\n\n');
  return [header, failSummary, infra, rates, cases].filter(Boolean).join('\n');
}

/**
 * Writes `<suite>-<capturedAt>.{json,md}` into `dir` (created if needed) and
 * returns the two absolute paths. The timestamp is taken from the manifest so
 * the artifact name matches the run it describes.
 */
export function writeGoldenReport(
  report: GoldenRunReport,
  dir: string,
): { jsonPath: string; mdPath: string } {
  mkdirSync(dir, { recursive: true });
  const stamp = report.manifest.capturedAt.replace(/[:.]/g, '-');
  const base = `${report.suite}-${stamp}`;
  const jsonPath = join(dir, `${base}.json`);
  const mdPath = join(dir, `${base}.md`);
  writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf8');
  writeFileSync(mdPath, renderGoldenReportMarkdown(report), 'utf8');
  return { jsonPath, mdPath };
}
