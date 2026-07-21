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
  const permitted = new Set([...c.requiredTools, ...c.allowedTools]);

  const missing = c.requiredTools.filter((r) => !actualSet.has(r));
  if (missing.length)
    return { passed: false, detail: `missing required tool(s): ${missing.join(', ')}` };

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

export function routingAccuracy(t: Trajectory, expectedDelegationTool: string): ScorerOutcome {
  return toolNames(t).includes(expectedDelegationTool)
    ? { passed: true, detail: `routed via ${expectedDelegationTool}` }
    : { passed: false, detail: `expected delegation tool ${expectedDelegationTool} not called` };
}
