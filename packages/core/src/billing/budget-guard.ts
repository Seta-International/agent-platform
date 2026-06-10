export type BudgetPeriod = 'day' | 'month';

export interface BudgetStatus {
  blocked: boolean;
  reason?: BudgetPeriod;
}

export interface BudgetGuard {
  check(tenantId: string): Promise<BudgetStatus>;
}

/** Thrown by call-sites when checkBudget reports blocked. Mapped to HTTP 402. */
export class BudgetExceededError extends Error {
  readonly period: BudgetPeriod;
  constructor(period: BudgetPeriod) {
    super(`budget_exceeded:${period}`);
    this.name = 'BudgetExceededError';
    this.period = period;
  }
}

let impl: BudgetGuard | null = null;

export function registerBudgetGuard(guard: BudgetGuard): void {
  impl = guard;
}

/**
 * Synchronous-ish pre-check. Default-allow when billing is not loaded.
 * FAILS OPEN: if the guard throws (e.g. DB hiccup), allow the request rather
 * than break chat for everyone — overshoot is bounded by the daily cap.
 */
export async function checkBudget(tenantId: string): Promise<BudgetStatus> {
  if (!impl) return { blocked: false };
  try {
    return await impl.check(tenantId);
  } catch (err) {
    console.error('[billing.budget-guard] check failed, failing open', err);
    return { blocked: false };
  }
}

/** Test-only: clear the registered guard between tests. */
export function __resetBudgetGuardForTests(): void {
  impl = null;
}
