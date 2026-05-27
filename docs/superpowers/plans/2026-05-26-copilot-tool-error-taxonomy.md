# CopilotToolError Taxonomy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wrap every tool exception in a structured `CopilotToolError` before it reaches the agent, ensuring the agent sees a safe `userMessage` while internal details stay in logs only.

**Architecture:** Add `CopilotToolError` as a base class in `sdks/copilot/src/errors.ts`, refactor the existing `ToolExecutionTimeoutError` and `ToolBreakerOpenError` to extend it, then add an outer catch-all in `wrap-execute.ts` that converts any non-structured exception to `CopilotToolError` via duck-typed `.code` mapping. Mastra reads `error.message` to pass errors to the LLM — setting `.message = userMessage` (via `super(params.userMessage)`) is the key AC3 control point.

**Tech Stack:** TypeScript, Vitest, `@mastra/core/tools`, Node 24 LTS.

---

## Branch prerequisite

This plan assumes you are on `feat/tool-execution-error`. That branch does **not** yet have the timeout/breaker infrastructure from `feat/tool-execution`. Task 0 merges it in.

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `sdks/copilot/src/errors.ts` | Modify | Add `CopilotToolError` base + `CopilotToolErrorCode`; refactor subclasses to extend it |
| `sdks/copilot/src/index.ts` | Modify | Export `CopilotToolError`, `CopilotToolErrorCode` |
| `sdks/copilot/src/wrap-execute.ts` | Modify | Add outer catch-all + `toCopilotToolError` helper |
| `sdks/copilot/tests/unit/errors.test.ts` | Create | Unit tests for the base class and subclass hierarchy |
| `sdks/copilot/tests/unit/wrap-execute-error-mapping.test.ts` | Create | Unit tests for AC1–AC4 end-to-end through `defineCopilotTool` |
| `packages/copilot/tests/integration/tool-timeout.integration.test.ts` | Modify | Update assertions: `code: 'tool_execution_timeout'` → `code: 'TIMEOUT'`; drop `toJSON()` |

**Task order matters:** errors.ts (Task 1) → index.ts export (Task 2) → wrap-execute.ts (Task 3). The error-mapping test imports `CopilotToolError` from `@seta/copilot-sdk`, so the index export must land in Task 2 before Task 3's tests run.

---

### Task 0: Merge feat/tool-execution

**Files:** (git operation only)

- [ ] **Step 1: Merge the timeout/breaker branch**

```bash
git merge feat/tool-execution --no-edit
```

Expected: clean merge. If there are conflicts, they will be in `packages/copilot/` — read each diff hunk and keep both sides.

- [ ] **Step 2: Verify the SDK files now exist**

```bash
ls sdks/copilot/src/errors.ts sdks/copilot/src/wrap-execute.ts sdks/copilot/src/circuit-breaker.ts
```

Expected: all three paths print without error.

- [ ] **Step 3: Run the SDK test suite to confirm the merge is clean**

```bash
pnpm --filter @seta/copilot-sdk test
```

Expected: all tests pass.

---

### Task 1: Add CopilotToolError base class and refactor subclasses

**Files:**
- Modify: `sdks/copilot/src/errors.ts`
- Create: `sdks/copilot/tests/unit/errors.test.ts`

- [ ] **Step 1: Write the failing test**

Create `sdks/copilot/tests/unit/errors.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import {
  CopilotToolError,
  ToolBreakerOpenError,
  ToolExecutionTimeoutError,
} from '../../src/errors';

describe('CopilotToolError', () => {
  it('sets .message to userMessage so Mastra only sees the safe string', () => {
    const e = new CopilotToolError({
      code: 'NOT_FOUND',
      retryable: false,
      userMessage: 'Resource not found.',
      internalDetail: 'row id=abc-123 missing from planner.tasks',
      toolId: 'planner_getTask',
    });
    expect(e.message).toBe('Resource not found.');
    expect(e.userMessage).toBe('Resource not found.');
    expect(e.internalDetail).toBe('row id=abc-123 missing from planner.tasks');
    expect(e.code).toBe('NOT_FOUND');
    expect(e.retryable).toBe(false);
    expect(e.toolId).toBe('planner_getTask');
    expect(e.name).toBe('CopilotToolError');
    expect(e).toBeInstanceOf(Error);
  });
});

describe('ToolExecutionTimeoutError', () => {
  it('extends CopilotToolError with code TIMEOUT', () => {
    const e = new ToolExecutionTimeoutError('planner_getTask', 30_000);
    expect(e).toBeInstanceOf(CopilotToolError);
    expect(e.code).toBe('TIMEOUT');
    expect(e.retryable).toBe(true);
    expect(e.toolId).toBe('planner_getTask');
    expect(e.timeoutMs).toBe(30_000);
    expect(e.message).toBe(e.userMessage);
    expect(e.name).toBe('ToolExecutionTimeoutError');
  });
});

describe('ToolBreakerOpenError', () => {
  it('extends CopilotToolError with code CIRCUIT_OPEN', () => {
    const openUntil = Date.now() + 60_000;
    const e = new ToolBreakerOpenError('planner_getTask', openUntil);
    expect(e).toBeInstanceOf(CopilotToolError);
    expect(e.code).toBe('CIRCUIT_OPEN');
    expect(e.retryable).toBe(true);
    expect(e.toolId).toBe('planner_getTask');
    expect(e.openUntil).toBe(openUntil);
    expect(e.message).toBe(e.userMessage);
    expect(e.name).toBe('ToolBreakerOpenError');
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
pnpm --filter @seta/copilot-sdk test tests/unit/errors.test.ts
```

Expected: fails — `CopilotToolError is not a constructor`.

- [ ] **Step 3: Replace errors.ts with the new implementation**

Replace the entire contents of `sdks/copilot/src/errors.ts` with:

```typescript
export type CopilotToolErrorCode =
  | 'PERMISSION_DENIED'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'VALIDATION'
  | 'TIMEOUT'
  | 'CIRCUIT_OPEN'
  | 'RATE_LIMITED'
  | 'TOOL_ERROR';

export class CopilotToolError extends Error {
  readonly code: CopilotToolErrorCode;
  readonly retryable: boolean;
  readonly userMessage: string;
  readonly internalDetail: string;
  readonly toolId: string;

  constructor(params: {
    code: CopilotToolErrorCode;
    retryable: boolean;
    userMessage: string;
    internalDetail: string;
    toolId: string;
  }) {
    super(params.userMessage); // .message === userMessage — what Mastra passes to the LLM
    this.code = params.code;
    this.retryable = params.retryable;
    this.userMessage = params.userMessage;
    this.internalDetail = params.internalDetail;
    this.toolId = params.toolId;
    this.name = 'CopilotToolError';
  }
}

export class ToolExecutionTimeoutError extends CopilotToolError {
  readonly timeoutMs: number;

  constructor(toolId: string, timeoutMs: number) {
    super({
      code: 'TIMEOUT',
      retryable: true,
      userMessage: `Tool '${toolId}' timed out. Try again later.`,
      internalDetail: `Tool '${toolId}' exceeded ${timeoutMs}ms execution timeout`,
      toolId,
    });
    this.timeoutMs = timeoutMs;
    this.name = 'ToolExecutionTimeoutError';
  }
}

export class ToolBreakerOpenError extends CopilotToolError {
  readonly openUntil: number;

  constructor(toolId: string, openUntil: number) {
    super({
      code: 'CIRCUIT_OPEN',
      retryable: true,
      userMessage: `Tool '${toolId}' is temporarily unavailable. Try again later.`,
      internalDetail: `Circuit breaker open until ${new Date(openUntil).toISOString()}`,
      toolId,
    });
    this.openUntil = openUntil;
    this.name = 'ToolBreakerOpenError';
  }
}
```

- [ ] **Step 4: Run the tests to confirm they pass**

```bash
pnpm --filter @seta/copilot-sdk test tests/unit/errors.test.ts
```

Expected: all 3 describe blocks pass.

- [ ] **Step 5: Run the full SDK suite to check nothing regressed**

```bash
pnpm --filter @seta/copilot-sdk test
```

Expected: all tests pass. (The existing breaker and AbortSignal tests still pass because they don't check `.code` string values.)

- [ ] **Step 6: Commit**

```bash
git add sdks/copilot/src/errors.ts sdks/copilot/tests/unit/errors.test.ts
git commit -m "feat(copilot-sdk): add CopilotToolError base class and taxonomy codes"
```

---

### Task 2: Export CopilotToolError from SDK public surface

**Files:**
- Modify: `sdks/copilot/src/index.ts`

This task must happen before Task 3 so the error-mapping tests can import `CopilotToolError` from `@seta/copilot-sdk`.

- [ ] **Step 1: Write the failing test**

Open `sdks/copilot/tests/unit/index.test.ts`. It currently has:

```typescript
import { describe, expect, it } from 'vitest';
import * as sdk from '../../src/index';

describe('sdk index re-exports', () => {
  it('exports registry primitives', () => {
    expect(typeof sdk.CopilotRegistry).toBe('object');
    expect(typeof sdk.CopilotRegistry.registerSpecialist).toBe('function');
    expect(typeof sdk.CopilotRegistry.freeze).toBe('function');
  });
});
```

Add a second test:

```typescript
  it('exports CopilotToolError', () => {
    expect(typeof sdk.CopilotToolError).toBe('function');
  });
```

- [ ] **Step 2: Run to confirm it fails**

```bash
pnpm --filter @seta/copilot-sdk test tests/unit/index.test.ts
```

Expected: fails — `sdk.CopilotToolError is undefined`.

- [ ] **Step 3: Add the exports to index.ts**

In `sdks/copilot/src/index.ts`, find the existing errors export line:

```typescript
export { ToolBreakerOpenError, ToolExecutionTimeoutError } from './errors.ts';
```

Replace it with:

```typescript
export {
  CopilotToolError,
  type CopilotToolErrorCode,
  ToolBreakerOpenError,
  ToolExecutionTimeoutError,
} from './errors.ts';
```

- [ ] **Step 4: Run to confirm the test passes**

```bash
pnpm --filter @seta/copilot-sdk test tests/unit/index.test.ts
```

Expected: both tests pass.

- [ ] **Step 5: Commit**

```bash
git add sdks/copilot/src/index.ts sdks/copilot/tests/unit/index.test.ts
git commit -m "feat(copilot-sdk): export CopilotToolError and CopilotToolErrorCode from public surface"
```

---

### Task 3: Add outer catch-all and error mapper in wrap-execute.ts

**Files:**
- Modify: `sdks/copilot/src/wrap-execute.ts`
- Create: `sdks/copilot/tests/unit/wrap-execute-error-mapping.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `sdks/copilot/tests/unit/wrap-execute-error-mapping.test.ts`:

```typescript
import { RequestContext } from '@mastra/core/request-context';
import {
  __resetBreakerEmitterForTests,
  __resetBreakersForTests,
  __resetExecutionPolicyForTests,
  CopilotToolError,
  ToolExecutionTimeoutError,
  defineCopilotTool,
  setExecutionPolicy,
} from '@seta/copilot-sdk';
import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

const TENANT = '00000000-0000-0000-0000-000000000001';
const ACTOR = { type: 'user' as const, user_id: '00000000-0000-0000-0000-000000000099' };

function makeCtx() {
  const rc = new RequestContext();
  rc.set('actor', ACTOR);
  rc.set('tenant_id', TENANT);
  return { requestContext: rc } as never;
}

function toolThatThrows(err: unknown) {
  return defineCopilotTool({
    id: 'test.throwing',
    name: 'Throwing tool',
    description: 'Always throws.',
    input: z.object({}),
    output: z.object({ ok: z.boolean() }),
    execute: async () => {
      throw err;
    },
  });
}

async function settle(tool: ReturnType<typeof toolThatThrows>) {
  const exec = (
    tool as unknown as { execute: (i: unknown, c: unknown) => Promise<unknown> }
  ).execute;
  return exec({}, makeCtx()).then(
    (value) => ({ ok: true as const, value }),
    (err: unknown) => ({ ok: false as const, err }),
  );
}

describe('wrap-execute error mapping', () => {
  beforeEach(() => {
    __resetBreakersForTests();
    __resetBreakerEmitterForTests();
    __resetExecutionPolicyForTests();
    setExecutionPolicy({ readMs: 30_000, writeMs: 60_000, maxMs: 300_000 });
  });

  it('AC1: FORBIDDEN domain error → CopilotToolError PERMISSION_DENIED', async () => {
    const result = await settle(
      toolThatThrows({ code: 'FORBIDDEN', message: 'missing permission planner.task.read' }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    const e = result.err as CopilotToolError;
    expect(e).toBeInstanceOf(CopilotToolError);
    expect(e.code).toBe('PERMISSION_DENIED');
    expect(e.retryable).toBe(false);
    expect(e.toolId).toBe('test.throwing');
  });

  it('AC3: PERMISSION_DENIED .message is the safe userMessage — internal detail absent', async () => {
    const result = await settle(
      toolThatThrows({
        code: 'FORBIDDEN',
        message: 'missing permission planner.task.read for group id=g-777',
      }),
    );
    if (result.ok) throw new Error('unreachable');
    const e = result.err as CopilotToolError;
    expect(e.message).toBe(e.userMessage);
    expect(e.message).not.toContain('g-777');
    expect(e.message).not.toContain('planner.task.read');
  });

  it('AC4: internalDetail retains the raw domain message', async () => {
    const result = await settle(
      toolThatThrows({
        code: 'FORBIDDEN',
        message: 'missing permission planner.task.read for group id=g-777',
      }),
    );
    if (result.ok) throw new Error('unreachable');
    const e = result.err as CopilotToolError;
    expect(e.internalDetail).toContain('g-777');
    expect(e.internalDetail).toContain('planner.task.read');
  });

  it('NOT_FOUND domain error → CopilotToolError NOT_FOUND, internal detail not in message', async () => {
    const result = await settle(
      toolThatThrows({ code: 'NOT_FOUND', message: 'task id=abc-123 not found' }),
    );
    if (result.ok) throw new Error('unreachable');
    const e = result.err as CopilotToolError;
    expect(e).toBeInstanceOf(CopilotToolError);
    expect(e.code).toBe('NOT_FOUND');
    expect(e.retryable).toBe(false);
    expect(e.message).not.toContain('abc-123');
    expect(e.internalDetail).toContain('abc-123');
  });

  it('CONFLICT domain error → CopilotToolError CONFLICT', async () => {
    const result = await settle(
      toolThatThrows({ code: 'CONFLICT', message: 'task already assigned' }),
    );
    if (result.ok) throw new Error('unreachable');
    const e = result.err as CopilotToolError;
    expect(e).toBeInstanceOf(CopilotToolError);
    expect(e.code).toBe('CONFLICT');
    expect(e.retryable).toBe(false);
  });

  it('VALIDATION domain error → CopilotToolError VALIDATION', async () => {
    const result = await settle(
      toolThatThrows({ code: 'VALIDATION', message: 'due_date must be in the future' }),
    );
    if (result.ok) throw new Error('unreachable');
    const e = result.err as CopilotToolError;
    expect(e).toBeInstanceOf(CopilotToolError);
    expect(e.code).toBe('VALIDATION');
    expect(e.retryable).toBe(false);
  });

  it('rate_limited error → CopilotToolError RATE_LIMITED (retryable)', async () => {
    const result = await settle(
      toolThatThrows({ code: 'rate_limited', message: 'turn limit exceeded' }),
    );
    if (result.ok) throw new Error('unreachable');
    const e = result.err as CopilotToolError;
    expect(e).toBeInstanceOf(CopilotToolError);
    expect(e.code).toBe('RATE_LIMITED');
    expect(e.retryable).toBe(true);
  });

  it('unknown error (no .code) → CopilotToolError TOOL_ERROR, internal detail not in message', async () => {
    const result = await settle(
      toolThatThrows(new Error('PG-12345: constraint violation on planner.tasks')),
    );
    if (result.ok) throw new Error('unreachable');
    const e = result.err as CopilotToolError;
    expect(e).toBeInstanceOf(CopilotToolError);
    expect(e.code).toBe('TOOL_ERROR');
    expect(e.retryable).toBe(false);
    expect(e.message).not.toContain('PG-12345');
    expect(e.internalDetail).toContain('PG-12345');
  });

  it('AC1: pre-existing CopilotToolError is re-thrown as the same object reference', async () => {
    const original = new CopilotToolError({
      code: 'NOT_FOUND',
      retryable: false,
      userMessage: 'Resource not found.',
      internalDetail: 'record id=abc not in db',
      toolId: 'test.throwing',
    });
    const result = await settle(toolThatThrows(original));
    if (result.ok) throw new Error('unreachable');
    expect(result.err).toBe(original);
  });

  it('ToolExecutionTimeoutError is instanceof CopilotToolError with code TIMEOUT', () => {
    const e = new ToolExecutionTimeoutError('planner_getTask', 500);
    expect(e).toBeInstanceOf(CopilotToolError);
    expect(e.code).toBe('TIMEOUT');
    expect(e.retryable).toBe(true);
    expect(e.message).toBe(e.userMessage);
  });
});
```

- [ ] **Step 2: Run to confirm the tests fail**

```bash
pnpm --filter @seta/copilot-sdk test tests/unit/wrap-execute-error-mapping.test.ts
```

Expected: most tests fail — domain errors are re-thrown as plain objects, not `CopilotToolError` instances.

- [ ] **Step 3: Replace wrap-execute.ts with the updated implementation**

Replace the entire contents of `sdks/copilot/src/wrap-execute.ts` with:

```typescript
import type { ToolExecutionContext } from '@mastra/core/tools';
import { getBreaker } from './circuit-breaker.ts';
import { anySignal } from './compose-signals.ts';
import {
  CopilotToolError,
  type CopilotToolErrorCode,
  ToolBreakerOpenError,
  ToolExecutionTimeoutError,
} from './errors.ts';
import { resolveTimeoutMs } from './execution-policy.ts';

type WrappableCtx = ToolExecutionContext<unknown, unknown, Record<string, unknown>>;

type UserExecute<I, O> = (input: I, ctx: WrappableCtx) => Promise<O | undefined>;

interface WrappableSpec {
  id: string;
  needsApproval?: boolean | ((...args: never[]) => unknown);
  executionTimeoutMs?: number;
}

const DOMAIN_CODE_MAP: Record<
  string,
  { code: CopilotToolErrorCode; retryable: boolean; userMessage: string }
> = {
  FORBIDDEN: {
    code: 'PERMISSION_DENIED',
    retryable: false,
    userMessage: 'You do not have permission to perform this action.',
  },
  NOT_FOUND: {
    code: 'NOT_FOUND',
    retryable: false,
    userMessage: 'The requested resource was not found.',
  },
  CONFLICT: {
    code: 'CONFLICT',
    retryable: false,
    userMessage: 'A conflict prevented this operation.',
  },
  VALIDATION: {
    code: 'VALIDATION',
    retryable: false,
    userMessage: 'The request was invalid. Check the inputs and try again.',
  },
  rate_limited: {
    code: 'RATE_LIMITED',
    retryable: true,
    userMessage: 'Rate limit reached. The agent will retry shortly.',
  },
};

function toCopilotToolError(err: unknown, toolId: string): CopilotToolError {
  if (err instanceof CopilotToolError) return err;

  const code = (err as { code?: unknown }).code;
  const rawMsg = err instanceof Error ? err.message : String(err);
  const match = typeof code === 'string' ? DOMAIN_CODE_MAP[code] : undefined;

  if (match) {
    return new CopilotToolError({ ...match, internalDetail: rawMsg, toolId });
  }

  return new CopilotToolError({
    code: 'TOOL_ERROR',
    retryable: false,
    userMessage: 'An internal error occurred. Please try again or contact support.',
    internalDetail: rawMsg,
    toolId,
  });
}

/**
 * Build a Mastra-compatible execute function that adds timeout, AbortSignal
 * composition, circuit-breaker semantics, and structured error taxonomy around
 * the tool author's `execute`. Behaviour:
 *
 *   1. Read tenant id from ctx.requestContext (throws if missing).
 *   2. If the (toolId, tenantId) breaker is open, fail fast with
 *      ToolBreakerOpenError (extends CopilotToolError).
 *   3. Compose ctx.abortSignal with a fresh timeout-driven AbortController and
 *      pass the composed signal back in via the ctx the user sees.
 *   4. Race the user's promise against the timeout. On timer fire abort the
 *      composed signal and throw ToolExecutionTimeoutError (extends CopilotToolError).
 *   5. Record breaker outcome.
 *   6. Outer catch-all: user-initiated cancellations propagate as-is; pre-existing
 *      CopilotToolError instances re-throw as-is; all other exceptions are converted
 *      to CopilotToolError via duck-typed .code mapping, with internalDetail logged
 *      and only the safe userMessage exposed as .message.
 */
export function wrapExecute<I, O>(spec: WrappableSpec, userExecute: UserExecute<I, O>) {
  return async function wrappedExecute(input: I, ctx: WrappableCtx): Promise<O | undefined> {
    try {
      return await executeWithTimeoutAndBreaker(spec, userExecute, input, ctx);
    } catch (err) {
      // User-initiated cancellation is not a tool failure — propagate raw.
      if (ctx.abortSignal?.aborted) throw err;
      // Already a structured CopilotToolError (Timeout, BreakerOpen, etc.) — re-throw as-is.
      if (err instanceof CopilotToolError) throw err;
      // Convert domain / unknown errors; log internal details for debugging.
      const structured = toCopilotToolError(err, spec.id);
      console.error('[copilot.tool-error]', {
        toolId: spec.id,
        code: structured.code,
        retryable: structured.retryable,
        internalDetail: structured.internalDetail,
        stack: err instanceof Error ? err.stack : undefined,
      });
      throw structured;
    }
  };
}

async function executeWithTimeoutAndBreaker<I, O>(
  spec: WrappableSpec,
  userExecute: UserExecute<I, O>,
  input: I,
  ctx: WrappableCtx,
): Promise<O | undefined> {
  const tenantId = tenantIdFromCtx(ctx);
  const breaker = getBreaker(spec.id, tenantId);

  if (breaker.isOpen()) {
    throw new ToolBreakerOpenError(spec.id, breaker.openUntil);
  }

  const timeoutMs = resolveTimeoutMs(spec);
  const timeoutController = new AbortController();
  const composed = anySignal([ctx.abortSignal, timeoutController.signal]);
  const callerSignal = ctx.abortSignal;

  const timer = setTimeout(() => {
    timeoutController.abort(new ToolExecutionTimeoutError(spec.id, timeoutMs));
  }, timeoutMs);

  try {
    const result = await userExecute(input, { ...ctx, abortSignal: composed });

    if (timeoutController.signal.aborted) {
      breaker.recordFailure('timeout');
      throw new ToolExecutionTimeoutError(spec.id, timeoutMs);
    }
    breaker.recordSuccess();
    return result;
  } catch (err) {
    if (timeoutController.signal.aborted) {
      breaker.recordFailure('timeout');
      throw new ToolExecutionTimeoutError(spec.id, timeoutMs);
    }
    if (callerSignal?.aborted) {
      throw err;
    }
    breaker.recordFailure('exception');
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function tenantIdFromCtx(ctx: WrappableCtx): string {
  const tenantId = ctx.requestContext?.get('tenant_id');
  if (typeof tenantId !== 'string' || !tenantId) {
    throw new Error(
      'wrapExecute: missing tenant id in ctx.requestContext — every agent invocation must set the tenant_id entry via requestContext.set("tenant_id", ...) (see packages/copilot/src/backend/routes.ts).',
    );
  }
  return tenantId;
}
```

- [ ] **Step 4: Run the error-mapping tests to confirm they pass**

```bash
pnpm --filter @seta/copilot-sdk test tests/unit/wrap-execute-error-mapping.test.ts
```

Expected: all 10 tests pass.

- [ ] **Step 5: Run the full SDK test suite**

```bash
pnpm --filter @seta/copilot-sdk test
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add sdks/copilot/src/wrap-execute.ts sdks/copilot/tests/unit/wrap-execute-error-mapping.test.ts
git commit -m "feat(copilot-sdk): outer catch-all in wrapExecute converts domain errors to CopilotToolError"
```

---

### Task 4: Update the integration test for tool execution timeout

**Files:**
- Modify: `packages/copilot/tests/integration/tool-timeout.integration.test.ts`

The existing test checks `err.toJSON().code === 'tool_execution_timeout'`. `ToolExecutionTimeoutError` now extends `CopilotToolError` and has `code: 'TIMEOUT'`. The `toJSON()` method is gone.

- [ ] **Step 1: Run the existing integration test to confirm it fails**

```bash
pnpm --filter @seta/copilot test tests/integration/tool-timeout.integration.test.ts -- --pool=threads
```

Expected: fails — `err.toJSON is not a function` or the code assertion fails.

- [ ] **Step 2: Update the assertions**

In `packages/copilot/tests/integration/tool-timeout.integration.test.ts`, find:

```typescript
    expect(settled.err).toBeInstanceOf(ToolExecutionTimeoutError);
    const err = settled.err as ToolExecutionTimeoutError;
    expect(err.toJSON()).toMatchObject({
      code: 'tool_execution_timeout',
      toolId: 'test.hanging',
      timeoutMs: 500,
    });
    expect(elapsed).toBeGreaterThanOrEqual(500);
    expect(elapsed).toBeLessThan(2_000);
```

Replace it with:

```typescript
    expect(settled.err).toBeInstanceOf(ToolExecutionTimeoutError);
    const err = settled.err as ToolExecutionTimeoutError;
    expect(err.code).toBe('TIMEOUT');
    expect(err.toolId).toBe('test.hanging');
    expect(err.timeoutMs).toBe(500);
    expect(err.retryable).toBe(true);
    expect(err.message).toBe(err.userMessage);
    expect(elapsed).toBeGreaterThanOrEqual(500);
    expect(elapsed).toBeLessThan(2_000);
```

- [ ] **Step 3: Run the integration test to confirm it passes**

```bash
pnpm --filter @seta/copilot test tests/integration/tool-timeout.integration.test.ts -- --pool=threads
```

Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add packages/copilot/tests/integration/tool-timeout.integration.test.ts
git commit -m "test(copilot): update timeout integration test — TIMEOUT code, no toJSON"
```

---

### Task 5: Full verification

- [ ] **Step 1: Run typecheck**

```bash
pnpm typecheck
```

Expected: zero errors.

- [ ] **Step 2: Run lint**

```bash
pnpm lint
```

Expected: zero errors.

- [ ] **Step 3: Run the full SDK unit suite**

```bash
pnpm --filter @seta/copilot-sdk test
```

Expected: all tests pass.

- [ ] **Step 4: Run the full copilot integration suite**

```bash
pnpm --filter @seta/copilot test -- --pool=threads
```

Expected: all tests pass.

- [ ] **Step 5: Commit any lint/typecheck fixes**

If steps 1–2 required fixes, commit them:

```bash
git add -A
git commit -m "fix(copilot-sdk): lint and typecheck fixes after CopilotToolError taxonomy"
```

---

## Spec coverage check

| AC | Task that implements it |
|---|---|
| AC1: All tool exceptions become `CopilotToolError` before reaching agent | Task 3 (outer catch-all in `wrapExecute`); tested in Task 3 "pre-existing CopilotToolError re-thrown as-is" + all mapping tests |
| AC2: `CopilotToolError` has `code`, `retryable`, `userMessage`, `internalDetail`, `toolId` | Task 1 (`CopilotToolError` constructor); all Task 3 tests assert all five fields |
| AC3: Raw exception message not exposed to user | Task 3 (`super(params.userMessage)` — `.message` = `userMessage`); AC3 tests assert `.message` excludes internal identifiers |
| AC4: Logs have full details; tool-result payload exposes only `userMessage` | Task 3 (`console.error` with `internalDetail`; Mastra reads `error.message` → `userMessage` only) |
