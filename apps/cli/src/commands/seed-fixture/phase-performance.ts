import type { SessionScope } from '@seta/core';
import { seedDemoEvaluations, vnYearMonth } from '@seta/people';
import { listAccounts } from '@seta/pm';
import pino from 'pino';

const log = pino({ name: 'cli/seed-fixture/performance' });

/**
 * How many past cycles to fill. The Performance period picker offers the current cycle
 * plus the four before it, so filling four leaves the newest one empty — which is the
 * point: it is how the "nothing evaluated yet" state gets exercised on a dev machine.
 */
const CYCLES_TO_FILL = 4;

/** The `n` cycle months before `month`, oldest first. */
function previousMonths(month: string, n: number): string[] {
  const [year, m] = month.split('-').map(Number) as [number, number];
  const out: string[] = [];
  for (let i = n; i >= 1; i -= 1) {
    const d = new Date(Date.UTC(year, m - 1 - i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}

export async function seedPerformance(session: SessionScope): Promise<void> {
  const current = vnYearMonth();
  const months = previousMonths(current, CYCLES_TO_FILL);

  const accounts = await listAccounts(session);
  const amByAccount = new Map(
    accounts.flatMap((a) => (a.am_worker_id ? [[a.account_id, a.am_worker_id] as const] : [])),
  );
  if (amByAccount.size === 0) {
    log.warn('no account has an AM — skipping performance evaluations');
    return;
  }

  const { submitted, skipped } = await seedDemoEvaluations(session, { months, amByAccount });
  log.info({ months, current_cycle_left_empty: current, submitted, skipped }, 'evaluations seeded');
}
