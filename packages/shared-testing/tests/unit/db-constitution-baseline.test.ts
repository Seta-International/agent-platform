import { describe, expect, it } from 'vitest';
import type { Violation } from '../../src/db-constitution.ts';
import {
  type BaselineRow,
  diffBaseline,
  parseBaseline,
  renderBaseline,
} from '../../src/db-constitution-baseline.ts';

const acceptedRow: BaselineRow = {
  rule: 'c5-unique-leads-tenant',
  object: 'core.session_scope_cache_pkey',
  status: 'accepted',
  reason: 'session_id is the natural key; see db-findings.md C5.',
};

const debtRow: BaselineRow = {
  rule: 'r4-missing-tenant-id',
  object: 'core.events',
  status: 'debt',
  reason: 'append-only ledger, tenant scoping tracked separately',
  ticket: 'FUT-551',
};

describe('parseBaseline', () => {
  it('accepts a well-formed baseline and returns it', () => {
    const rows = parseBaseline([acceptedRow, debtRow]);
    expect(rows).toEqual([acceptedRow, debtRow]);
  });

  it('throws when the input is not an array', () => {
    expect(() => parseBaseline({ not: 'an array' })).toThrow(TypeError);
    expect(() => parseBaseline({ not: 'an array' })).toThrow(/array/i);
  });

  it('throws when a row is not an object', () => {
    expect(() => parseBaseline(['not an object'])).toThrow(/object/i);
  });

  it('throws naming the row when rule is missing', () => {
    const bad = { ...debtRow, rule: undefined };
    expect(() => parseBaseline([bad])).toThrow(/rule/i);
  });

  it('throws naming the row when rule is an empty string', () => {
    const bad = { ...debtRow, rule: '' };
    expect(() => parseBaseline([bad])).toThrow(/rule/i);
  });

  it('throws naming the row when object is missing', () => {
    const bad = { ...debtRow, object: undefined };
    expect(() => parseBaseline([bad])).toThrow(/object/i);
  });

  it('throws naming the row when object is an empty string', () => {
    const bad = { ...debtRow, object: '' };
    expect(() => parseBaseline([bad])).toThrow(/object/i);
  });

  it('throws when status is neither accepted nor debt', () => {
    const bad = { ...debtRow, status: 'ignored' };
    expect(() => parseBaseline([bad])).toThrow(/status/i);
  });

  it('throws naming the row when reason is missing, for status accepted', () => {
    const bad: Record<string, unknown> = { ...acceptedRow };
    delete bad.reason;
    expect(() => parseBaseline([bad])).toThrow(/reason/i);
    expect(() => parseBaseline([bad])).toThrow(/c5-unique-leads-tenant/);
  });

  it('throws when reason is not a string, for status debt', () => {
    const bad = { ...debtRow, reason: 42 };
    expect(() => parseBaseline([bad])).toThrow(/reason/i);
  });

  it('throws when reason trims to empty, for status accepted', () => {
    const bad = { ...acceptedRow, reason: '   ' };
    expect(() => parseBaseline([bad])).toThrow(/reason/i);
  });

  it('throws when reason trims to empty, for status debt', () => {
    const bad = { ...debtRow, reason: '   ' };
    expect(() => parseBaseline([bad])).toThrow(/reason/i);
  });

  it('throws when status is debt and ticket is missing', () => {
    const bad: Record<string, unknown> = { ...debtRow };
    delete bad.ticket;
    expect(() => parseBaseline([bad])).toThrow(/ticket/i);
    expect(() => parseBaseline([bad])).toThrow(/r4-missing-tenant-id/);
  });

  it('throws when status is debt and ticket does not match /^FUT-\\d+$/', () => {
    const bad = { ...debtRow, ticket: 'JIRA-123' };
    expect(() => parseBaseline([bad])).toThrow(/ticket/i);
  });

  it('throws when status is debt and ticket is FUT- with no digits', () => {
    const bad = { ...debtRow, ticket: 'FUT-' };
    expect(() => parseBaseline([bad])).toThrow(/ticket/i);
  });

  it('throws when status is accepted and ticket is present', () => {
    const bad = { ...acceptedRow, ticket: 'FUT-551' };
    expect(() => parseBaseline([bad])).toThrow(/ticket/i);
    expect(() => parseBaseline([bad])).toThrow(/c5-unique-leads-tenant/);
  });

  it('throws on a duplicate (rule, object) pair', () => {
    const dup = { ...debtRow };
    expect(() => parseBaseline([debtRow, dup])).toThrow(/duplicate/i);
    expect(() => parseBaseline([debtRow, dup])).toThrow(/r4-missing-tenant-id/);
  });

  it('does not throw duplicate for rows sharing only rule, or only object', () => {
    const sameRuleDiffObject: BaselineRow = { ...debtRow, object: 'core.other_table' };
    const sameObjectDiffRule: BaselineRow = { ...debtRow, rule: 'other-rule' };
    expect(() => parseBaseline([debtRow, sameRuleDiffObject, sameObjectDiffRule])).not.toThrow();
  });
});

describe('diffBaseline', () => {
  const violation: Violation = {
    rule: 'r4-missing-tenant-id',
    object: 'core.events',
    detail: 'missing tenant_id column',
  };

  it('returns a violation absent from the baseline as fresh', () => {
    const { fresh, stale } = diffBaseline([violation], []);
    expect(fresh).toEqual([violation]);
    expect(stale).toEqual([]);
  });

  it('returns a baseline row with no matching violation as stale', () => {
    const { fresh, stale } = diffBaseline([], [debtRow]);
    expect(fresh).toEqual([]);
    expect(stale).toEqual([debtRow]);
  });

  it('matches a violation to a baseline row by (rule, object) and reports neither', () => {
    const { fresh, stale } = diffBaseline([violation], [debtRow]);
    expect(fresh).toEqual([]);
    expect(stale).toEqual([]);
  });

  it('does not match rows that share only rule or only object', () => {
    const differentObject: Violation = { ...violation, object: 'core.other_table' };
    const { fresh, stale } = diffBaseline([differentObject], [debtRow]);
    expect(fresh).toEqual([differentObject]);
    expect(stale).toEqual([debtRow]);
  });

  it('preserves violations input order in fresh', () => {
    const v1: Violation = { rule: 'z-rule', object: 'a.a', detail: '' };
    const v2: Violation = { rule: 'a-rule', object: 'z.z', detail: '' };
    const { fresh } = diffBaseline([v1, v2], []);
    expect(fresh).toEqual([v1, v2]);
  });

  it('preserves baseline input order in stale', () => {
    const row1: BaselineRow = { ...debtRow, object: 'core.z' };
    const row2: BaselineRow = { ...debtRow, object: 'core.a' };
    const { stale } = diffBaseline([], [row1, row2]);
    expect(stale).toEqual([row1, row2]);
  });
});

describe('renderBaseline', () => {
  it('emits pretty-printed JSON with two-space indent and a trailing newline', () => {
    const violation: Violation = {
      rule: 'r4-missing-tenant-id',
      object: 'core.events',
      detail: 'x',
    };
    const text = renderBaseline([violation]);
    expect(text.endsWith('\n')).toBe(true);
    expect(text).toContain('\n  ');
  });

  it('emits each row with status debt, reason empty string, and no ticket key, in key order rule/object/status/reason', () => {
    const violation: Violation = {
      rule: 'r4-missing-tenant-id',
      object: 'core.events',
      detail: 'x',
    };
    const text = renderBaseline([violation]);
    const parsed = JSON.parse(text) as unknown[];
    expect(parsed).toEqual([
      { rule: 'r4-missing-tenant-id', object: 'core.events', status: 'debt', reason: '' },
    ]);
    expect(Object.keys(parsed[0] as object)).toEqual(['rule', 'object', 'status', 'reason']);
    expect('ticket' in (parsed[0] as object)).toBe(false);
  });

  it('sorts rows by rule then object using byte comparison, not localeCompare', () => {
    const violations: Violation[] = [
      { rule: 'b-rule', object: 'core.a', detail: '' },
      { rule: 'a-rule', object: 'core.z', detail: '' },
      { rule: 'a-rule', object: 'core.a', detail: '' },
      // Uppercase 'Z' (0x5A) sorts before lowercase 'a' (0x61) in byte order;
      // localeCompare (ICU) compares base letters first and orders 'a' before 'Z'.
      { rule: 'a-rule', object: 'core.Z', detail: '' },
    ];
    const text = renderBaseline(violations);
    const parsed = JSON.parse(text) as Array<{ rule: string; object: string }>;
    expect(parsed.map((r) => `${r.rule}::${r.object}`)).toEqual([
      'a-rule::core.Z',
      'a-rule::core.a',
      'a-rule::core.z',
      'b-rule::core.a',
    ]);
  });

  it('produces output that JSON.parse + parseBaseline rejects, because generated reason is empty', () => {
    const violation: Violation = {
      rule: 'r4-missing-tenant-id',
      object: 'core.events',
      detail: 'x',
    };
    const text = renderBaseline([violation]);
    const parsed = JSON.parse(text);
    expect(() => parseBaseline(parsed)).toThrow(/reason/i);
  });

  it('produces valid JSON for an empty violation list', () => {
    const text = renderBaseline([]);
    expect(JSON.parse(text)).toEqual([]);
    expect(text.endsWith('\n')).toBe(true);
  });
});
