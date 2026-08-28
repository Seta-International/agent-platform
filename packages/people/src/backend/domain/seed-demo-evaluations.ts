import type { SessionScope } from '@seta/core';
import { and, eq } from 'drizzle-orm';
import { peopleDb } from '../db/client.ts';
import { workerAllocationProjection } from '../db/schema.ts';
import { readEvaluation, submitEvaluation } from './evaluation.ts';
import { setMonthClock, VN_OFFSET_MS } from './month-clock.ts';
import { allocationInMonth } from './read-performance-context.ts';

/**
 * Fill past cycles with plausible submitted evaluations so the dashboards have
 * something to show on a dev machine. **Development only** — the CLI calls this behind
 * `--demo`; nothing in the request path does.
 *
 * It writes through the real domain (`readEvaluation` → `submitEvaluation`) rather than
 * inserting rows, so seeded data obeys every rule the product enforces: the cycle
 * window, the frozen config revision, completeness, and the server-computed overall.
 * The month clock is moved to each cycle's open window for the duration and restored
 * afterwards.
 */
export async function seedDemoEvaluations(
  session: SessionScope,
  opts: {
    /** Cycle months to fill, newest last. The current cycle is deliberately not in here. */
    months: readonly string[];
    /** account_id → AM person id, from `pm` — the AM evaluates each project's TL. */
    amByAccount: ReadonlyMap<string, string>;
    /** Fraction of the newest seeded cycle left unevaluated, so "pending" states show. */
    pendingRatio?: number;
  },
): Promise<{ submitted: number; skipped: number }> {
  let submitted = 0;
  let skipped = 0;
  const newest = opts.months.at(-1);
  const pendingRatio = opts.pendingRatio ?? 0.2;

  try {
    for (const month of opts.months) {
      setMonthClock(() => openWindowInstant(month));
      const pairs = await loadPairs(session, month);

      for (const pair of pairs) {
        const evaluator =
          pair.lead_person_id && pair.lead_person_id !== pair.person_id
            ? pair.lead_person_id
            : (opts.amByAccount.get(pair.account_id) ?? null);
        if (!evaluator || evaluator === pair.person_id) {
          skipped += 1;
          continue;
        }
        const key = `${pair.person_id}:${pair.project_id}:${month}`;
        if (month === newest && hash01(key) < pendingRatio) {
          skipped += 1;
          continue;
        }

        const evaluatorSession: SessionScope = { ...session, person_id: evaluator };
        const target = {
          month,
          subject_person_id: pair.person_id,
          project_id: pair.project_id,
        };
        try {
          const view = await readEvaluation(evaluatorSession, target);
          if (view.status === 'submitted') {
            skipped += 1;
            continue;
          }
          await submitEvaluation(evaluatorSession, {
            ...target,
            base_version: view.version,
            scores: view.groups.flatMap((g) =>
              g.criteria.map((c) => ({
                criterion_id: c.criterion_id,
                score: seededScore(`${key}:${c.criterion_id}`),
                evidence: EVIDENCE[
                  Math.floor(hash01(`e:${key}:${c.criterion_id}`) * EVIDENCE.length)
                ] as string,
              })),
            ),
            strengths: pick(STRENGTHS, `s:${key}`),
            improve: pick(IMPROVE, `i:${key}`),
            top_action: pick(TOP_ACTIONS, `t:${key}`),
          });
          submitted += 1;
        } catch {
          // A pair the domain refuses (deleted person, project without config) is not
          // worth failing a whole demo seed over.
          skipped += 1;
        }
      }
    }
  } finally {
    // Back to the real clock — the module-level clock is process-wide.
    setMonthClock();
  }

  return { submitted, skipped };
}

/** The 26th at 10:00 VN — inside the month's open window, whatever "today" is. */
function openWindowInstant(month: string): Date {
  const [year, m] = month.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(year, m - 1, 26, 10) - VN_OFFSET_MS);
}

async function loadPairs(
  session: SessionScope,
  month: string,
): Promise<
  { person_id: string; project_id: string; account_id: string; lead_person_id: string | null }[]
> {
  const rows = await peopleDb()
    .select({
      person_id: workerAllocationProjection.person_id,
      project_id: workerAllocationProjection.project_id,
      account_id: workerAllocationProjection.account_id,
      lead_person_id: workerAllocationProjection.lead_person_id,
    })
    .from(workerAllocationProjection)
    .where(
      and(eq(workerAllocationProjection.tenant_id, session.tenant_id), allocationInMonth(month)),
    );

  const seen = new Map<string, (typeof rows)[number] & { person_id: string }>();
  for (const r of rows) {
    if (!r.person_id) continue;
    const key = `${r.person_id}:${r.project_id}`;
    if (!seen.has(key)) seen.set(key, { ...r, person_id: r.person_id });
  }
  return [...seen.values()];
}

/** Stable string hash → [0, 1), so a reseed produces the same numbers. */
function hash01(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i += 1) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

/** Mostly 3–4 with a tail either way, so heat maps show a range rather than a wash. */
function seededScore(key: string): number {
  const r = hash01(key);
  if (r < 0.06) return 2;
  if (r < 0.34) return 3;
  if (r < 0.84) return 4;
  return 5;
}

function pick(list: readonly string[], key: string): string {
  return list[Math.floor(hash01(key) * list.length)] as string;
}

const EVIDENCE: readonly string[] = [
  'Closed the sprint scope with no carry-over.',
  'Led the incident review and shipped the follow-up fix.',
  'Wrote the migration runbook the rest of the team reused.',
  'Consistently reviewed PRs within a day.',
  'Raised the integration risk two weeks before it landed.',
];

const STRENGTHS: readonly string[] = [
  'Reliable on delivery; unblocks others before being asked.',
  'Strong ownership of the module, from design through on-call.',
  'Clear written updates — the client stopped asking for status calls.',
  'Mentors the two juniors and still hits their own scope.',
];

const IMPROVE: readonly string[] = [
  'Estimates run optimistic; break work down further before committing.',
  'English fluency in client calls — target B2 → C1 this quarter.',
  'Share design decisions earlier; reviews arrive too late to change much.',
  'Test coverage on new endpoints trails the rest of the service.',
];

const TOP_ACTIONS: readonly string[] = [
  'Pair on the release checklist with the TL for the next two cycles.',
  '30 min/day Business English; review progress at the next cycle.',
  'Write the design note before implementation on the next two stories.',
  'Add integration tests to the two endpoints shipped this month.',
];
