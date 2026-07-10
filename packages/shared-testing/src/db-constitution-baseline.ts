import type { Violation } from './db-constitution.ts';

export interface BaselineRow {
  rule: string;
  object: string;
  status: 'accepted' | 'debt';
  reason: string;
  ticket?: string;
}

const TICKET_PATTERN = /^FUT-\d+$/;

function fail(message: string): never {
  throw new TypeError(message);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function parseRow(raw: unknown, index: number): BaselineRow {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    fail(`db-constitution-baseline: row at index ${index} is not an object`);
  }
  const row = raw as Record<string, unknown>;

  if (!isNonEmptyString(row.rule)) {
    fail(`db-constitution-baseline: row at index ${index} has a missing or invalid "rule"`);
  }
  const rule = row.rule;

  if (!isNonEmptyString(row.object)) {
    fail(
      `db-constitution-baseline: row "${rule}" (index ${index}) has a missing or invalid "object"`,
    );
  }
  const object = row.object;

  const label = `${rule}::${object}`;

  if (row.status !== 'accepted' && row.status !== 'debt') {
    fail(
      `db-constitution-baseline: row "${label}" has an invalid "status" (must be "accepted" or "debt")`,
    );
  }
  const status = row.status;

  if (typeof row.reason !== 'string' || row.reason.trim() === '') {
    fail(`db-constitution-baseline: row "${label}" has a missing, non-string, or empty "reason"`);
  }
  const reason = row.reason;

  if (status === 'debt') {
    if (!isNonEmptyString(row.ticket) || !TICKET_PATTERN.test(row.ticket)) {
      fail(
        `db-constitution-baseline: row "${label}" has status "debt" and requires a "ticket" matching /^FUT-\\d+$/`,
      );
    }
    return { rule, object, status, reason, ticket: row.ticket };
  }

  if (row.ticket !== undefined) {
    fail(
      `db-constitution-baseline: row "${label}" has status "accepted" and must not carry a "ticket"`,
    );
  }
  return { rule, object, status, reason };
}

export function parseBaseline(json: unknown): BaselineRow[] {
  if (!Array.isArray(json)) {
    fail('db-constitution-baseline: baseline must be an array of rows');
  }

  const rows = json.map((raw, index) => parseRow(raw, index));

  const seen = new Set<string>();
  for (const row of rows) {
    const key = `${row.rule}::${row.object}`;
    if (seen.has(key)) {
      fail(
        `db-constitution-baseline: duplicate baseline row for rule "${row.rule}", object "${row.object}"`,
      );
    }
    seen.add(key);
  }

  return rows;
}

export function diffBaseline(
  violations: readonly Violation[],
  baseline: readonly BaselineRow[],
): { fresh: Violation[]; stale: BaselineRow[] } {
  const baselineKeys = new Set(baseline.map((row) => `${row.rule}::${row.object}`));
  const violationKeys = new Set(violations.map((v) => `${v.rule}::${v.object}`));

  const fresh = violations.filter((v) => !baselineKeys.has(`${v.rule}::${v.object}`));
  const stale = baseline.filter((row) => !violationKeys.has(`${row.rule}::${row.object}`));

  return { fresh, stale };
}

function byteCompare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

// renderBaseline always writes reason: '' — parseBaseline rejects an empty reason for
// either status, so a regenerated baseline can never be committed until a human reads
// each violation and writes down why it is tolerated. Generation must never be able to
// launder a violation into a silent pass.
export function renderBaseline(violations: readonly Violation[]): string {
  const rows = violations
    .map((v) => ({ rule: v.rule, object: v.object, status: 'debt' as const, reason: '' }))
    .sort((a, b) => byteCompare(a.rule, b.rule) || byteCompare(a.object, b.object));

  return `${JSON.stringify(rows, null, 2)}\n`;
}
