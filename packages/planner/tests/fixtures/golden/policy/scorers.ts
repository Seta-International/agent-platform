// packages/planner/tests/fixtures/golden/policy/scorers.ts
//
// Deterministic Axis-A scorers (design spec Part 2). Each reads only a Trajectory
// + the case-side constraints; none touch a DB or model.
import { globalForbiddenTools } from './forbidden-tools.ts';
import { type Trajectory, toolNames } from './trajectory.ts';

export interface ScorerOutcome {
  passed: boolean;
  detail: string;
}

export function readOnlySafety(t: Trajectory, opts: { caseForbidden: string[] }): ScorerOutcome {
  const forbidden = new Set([...globalForbiddenTools(), ...opts.caseForbidden]);
  const hits = toolNames(t).filter((n) => forbidden.has(n));
  return hits.length === 0
    ? { passed: true, detail: 'no forbidden tool called' }
    : { passed: false, detail: `forbidden tool(s) called: ${hits.join(', ')}` };
}

export interface ToolSelectionConstraints {
  requiredTools: string[];
  allowedTools: string[];
  requiredPartialOrder: { before: string; after: string[] }[];
}

export function toolSelection(t: Trajectory, c: ToolSelectionConstraints): ScorerOutcome {
  const actual = toolNames(t);
  const actualSet = new Set(actual);
  // A required tool only counts as satisfied when it actually succeeded — a call
  // that errored (ok=false) left the agent without the data it needed, so it
  // must not pass the gate (otherwise error-recovery answers score as success).
  const succeededSet = new Set(t.toolCalls.filter((call) => call.ok).map((call) => call.toolName));
  const permitted = new Set([...c.requiredTools, ...c.allowedTools]);

  const missing = c.requiredTools.filter((r) => !succeededSet.has(r));
  if (missing.length) {
    const failed = missing.filter((r) => actualSet.has(r));
    const absent = missing.filter((r) => !actualSet.has(r));
    const parts: string[] = [];
    if (failed.length) parts.push(`required tool(s) failed: ${failed.join(', ')}`);
    if (absent.length) parts.push(`missing required tool(s): ${absent.join(', ')}`);
    return { passed: false, detail: parts.join('; ') };
  }

  const extraneous = actual.filter((n) => !permitted.has(n));
  if (extraneous.length)
    return { passed: false, detail: `extraneous tool(s): ${extraneous.join(', ')}` };

  for (const rule of c.requiredPartialOrder) {
    const beforeIdx = actual.indexOf(rule.before);
    for (const after of rule.after) {
      const afterIdx = actual.indexOf(after);
      if (beforeIdx === -1 || afterIdx === -1 || beforeIdx > afterIdx) {
        return { passed: false, detail: `order violated: ${rule.before} must precede ${after}` };
      }
    }
  }
  return { passed: true, detail: 'tool selection satisfied' };
}

export interface ArgPredicate {
  tool: string;
  path: string; // dotted path into the tool's args
  operator: 'equals' | 'subsetOf' | 'notEquals';
  value: unknown;
}

function readPath(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((node, seg) => {
    if (typeof node !== 'object' || node === null) return undefined;
    return (node as Record<string, unknown>)[seg];
  }, obj);
}

function checkPredicate(actual: unknown, p: ArgPredicate): boolean {
  if (p.operator === 'equals') return JSON.stringify(actual) === JSON.stringify(p.value);
  if (p.operator === 'notEquals') return JSON.stringify(actual) !== JSON.stringify(p.value);
  if (!Array.isArray(actual) || !Array.isArray(p.value)) return false; // subsetOf
  const superset = new Set(p.value as unknown[]);
  return (actual as unknown[]).every((x) => superset.has(x));
}

export function scopeArgumentCorrectness(t: Trajectory, predicates: ArgPredicate[]): ScorerOutcome {
  for (const p of predicates) {
    const call = t.toolCalls.find((c) => c.toolName === p.tool);
    if (!call) return { passed: false, detail: `predicate tool not called: ${p.tool}` };
    if (!checkPredicate(readPath(call.args, p.path), p)) {
      return {
        passed: false,
        detail: `arg predicate failed: ${p.tool}.${p.path} ${p.operator} ${JSON.stringify(p.value)}`,
      };
    }
  }
  return { passed: true, detail: 'arg predicates satisfied' };
}

export function expectedBehavior(io: { expected: string; observed: string }): ScorerOutcome {
  return io.expected === io.observed
    ? { passed: true, detail: `behavior ${io.observed}` }
    : { passed: false, detail: `behavior expected ${io.expected}, got ${io.observed}` };
}

export function noFabrication(io: {
  answer: string;
  forbiddenEntities: string[];
  forbiddenText: string[];
}): ScorerOutcome {
  const hay = io.answer.toLowerCase();
  const hits = [...io.forbiddenEntities, ...io.forbiddenText].filter((needle) =>
    hay.includes(needle.toLowerCase()),
  );
  return hits.length === 0
    ? { passed: true, detail: 'no fabricated/forbidden content' }
    : { passed: false, detail: `forbidden content present: ${hits.join(', ')}` };
}

export function trajectoryEfficiency(t: Trajectory, maxToolCalls: number): ScorerOutcome {
  const n = t.toolCalls.length;
  return n <= maxToolCalls
    ? { passed: true, detail: `${n} calls <= ${maxToolCalls}` }
    : { passed: false, detail: `${n} calls > ${maxToolCalls}` };
}

/** Every standalone integer/decimal token in `text`. Deliberately excludes
 *  numbers embedded in longer alphanumerics (ids, UUIDs) via the \b boundaries. */
function extractNumbers(text: string): string[] {
  return text.match(/\b\d+(?:\.\d+)?\b/g) ?? [];
}

/** Deterministic anti-fabrication check: a *live* figure in the answer must be
 *  traceable to a source the agent actually saw — a successful tool result or
 *  the user's own words. A number present in the answer but in neither is an
 *  unsupported (fabricated) claim. This is the cheap first line of defense that
 *  would have caught PQ-012's invented "5 / 8 / 6 members" without an LLM judge.
 *
 *  Sources = the stringified successful tool results (ok !== false) plus the
 *  user prompt. Callers should gate this to count/overview/workload intents; it
 *  intentionally does not special-case ordinals/percentages/dates, so enabling
 *  it on prose-heavy answers will over-fire. */
export function unsupportedNumericClaim(io: {
  answer: string;
  toolResults: unknown[];
  userText: string;
}): ScorerOutcome {
  const supported = [io.userText, ...io.toolResults.map((r) => JSON.stringify(r ?? ''))].join('\n');
  const unsupported = extractNumbers(io.answer).filter((n) => !supported.includes(n));
  return unsupported.length === 0
    ? { passed: true, detail: 'all numeric claims grounded in a source' }
    : { passed: false, detail: `unsupported numeric claim(s): ${unsupported.join(', ')}` };
}

export function routingAccuracy(t: Trajectory, expectedDelegationTool: string): ScorerOutcome {
  return toolNames(t).includes(expectedDelegationTool)
    ? { passed: true, detail: `routed via ${expectedDelegationTool}` }
    : { passed: false, detail: `expected delegation tool ${expectedDelegationTool} not called` };
}

/** What a case asked of the database for one turn. `'none'` is BR-03's assertion. */
export type ExpectedDbEffects =
  | 'none'
  | { rowsChanged: number; after: { table: string; id: string; [column: string]: unknown }[] };

/** What the driver observed by diffing the tenant's rows across the turn. */
export interface ObservedDbEffects {
  rowsChanged: number;
  /** One string per failed column assertion, formatted by the driver. */
  mismatches: string[];
  /** `table:id` of every row that changed — diagnostic only. */
  changedKeys?: string[];
}

/**
 * Compares a turn's declared database effect against the observed one.
 *
 * Pure by design: the driver owns the two snapshots and the SQL, this owns the
 * verdict — the same split every other scorer in this file follows.
 *
 * An ABSENT expectation fails, deliberately. A case that asserts nothing about
 * rows must not claim a db-backed metric.
 */
export function dbEffects(io: {
  expected?: ExpectedDbEffects;
  observed: ObservedDbEffects;
}): ScorerOutcome {
  if (io.expected === undefined) {
    return { passed: false, detail: 'no dbEffects declared — nothing asserted about rows' };
  }
  if (io.expected === 'none') {
    return io.observed.rowsChanged === 0
      ? { passed: true, detail: 'no rows changed' }
      : {
          passed: false,
          detail: `expected no write, ${io.observed.rowsChanged} row(s) changed: ${(
            io.observed.changedKeys ?? []
          ).join(', ')}`,
        };
  }
  if (io.observed.rowsChanged !== io.expected.rowsChanged) {
    return {
      passed: false,
      detail: `rowsChanged ${io.observed.rowsChanged}, expected ${io.expected.rowsChanged}`,
    };
  }
  if (io.observed.mismatches.length > 0) {
    return { passed: false, detail: io.observed.mismatches.join('; ') };
  }
  return { passed: true, detail: `${io.observed.rowsChanged} row(s) changed as expected` };
}
