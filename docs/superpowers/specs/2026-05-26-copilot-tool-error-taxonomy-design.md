# CopilotToolError Taxonomy — Design Spec

**Date:** 2026-05-26  
**Branch:** feat/tool-execution  
**Status:** Approved

## Problem

When a tool throws, Mastra captures the raw exception and streams `error.message` to the agent. The agent receives free-text error messages with no structure. This means:

- The agent cannot distinguish transient errors (retry) from permanent ones (give up).
- Raw internal error messages (stack details, DB constraint text, internal IDs) may leak to the agent context and potentially to the user.
- Specialist instructions cannot handle errors intelligently.

## Acceptance Criteria

- **AC1** — All tool exceptions are converted to `CopilotToolError` before returning to the agent.
- **AC2** — `CopilotToolError` includes: `code`, `retryable`, `userMessage`, `internalDetail`, `toolId`.
- **AC3** — Raw exception message and stack trace are never exposed to the user or agent.
- **AC4** — Logs retain full internal error details for debugging; the tool-result payload exposes only the safe `userMessage`.

## Architecture

### Data Flow

```
Tool throws (any error)
       │
       ▼
wrap-execute.ts — outer catch-all
       │
       ├─ instanceof CopilotToolError? → re-throw as-is (already structured)
       │    (ToolExecutionTimeoutError, ToolBreakerOpenError extend CopilotToolError)
       │
       ├─ duck-type on .code property
       │    'FORBIDDEN'    → PERMISSION_DENIED  (retryable: false)
       │    'NOT_FOUND'    → NOT_FOUND          (retryable: false)
       │    'CONFLICT'     → CONFLICT           (retryable: false)
       │    'VALIDATION'   → VALIDATION         (retryable: false)
       │    'rate_limited' → RATE_LIMITED       (retryable: true)
       │
       └─ unknown / no .code → TOOL_ERROR (retryable: false)

Before throw → console.error({ toolId, code, internalDetail, stack })

CopilotToolError.message = userMessage   ← Mastra reads .message → LLM sees this only
CopilotToolError.internalDetail          ← only in logs, never in tool-result payload
       │
       ▼
Mastra llm-mapping-step.ts line 277
  result: toolCall.error?.message  → userMessage only ✓
       │
       ▼
routes.ts: part.errorText = i.errorText → userMessage only ✓
       │
       ▼
UI client: sees safe errorText ✓
```

### Why `.message === userMessage`

Mastra extracts `toolCall.error?.message` and passes it as the tool result content to the LLM (see `llm-mapping-step.ts:277`). By setting `super(params.userMessage)` in `CopilotToolError`, we guarantee the only text the LLM (and downstream UI) sees is the sanitized `userMessage`. The `internalDetail` field is never set as `.message`.

## Component Design

### `sdks/copilot/src/errors.ts`

```typescript
export type CopilotToolErrorCode =
  | 'PERMISSION_DENIED'   // domain: FORBIDDEN
  | 'NOT_FOUND'           // domain: NOT_FOUND
  | 'CONFLICT'            // domain: CONFLICT
  | 'VALIDATION'          // domain: VALIDATION
  | 'TIMEOUT'             // ToolExecutionTimeoutError
  | 'CIRCUIT_OPEN'        // ToolBreakerOpenError
  | 'RATE_LIMITED'        // RateLimitError
  | 'TOOL_ERROR';         // catch-all

export class CopilotToolError extends Error {
  readonly code: CopilotToolErrorCode;
  readonly retryable: boolean;
  readonly userMessage: string;    // safe for LLM + user
  readonly internalDetail: string; // never serialized to client
  readonly toolId: string;

  constructor(params: {
    code: CopilotToolErrorCode;
    retryable: boolean;
    userMessage: string;
    internalDetail: string;
    toolId: string;
  }) {
    super(params.userMessage); // .message = userMessage — what Mastra passes to LLM
    this.code = params.code;
    this.retryable = params.retryable;
    this.userMessage = params.userMessage;
    this.internalDetail = params.internalDetail;
    this.toolId = params.toolId;
    this.name = 'CopilotToolError';
  }
}
```

`ToolExecutionTimeoutError` and `ToolBreakerOpenError` are refactored to extend `CopilotToolError`:

```typescript
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
  }
}
```

**Breaking change:** `.code` on the existing error classes changes from lowercase snake (`'tool_execution_timeout'`, `'tool_breaker_open'`) to uppercase short codes (`'TIMEOUT'`, `'CIRCUIT_OPEN'`). The existing integration test `tool-timeout.integration.test.ts` must be updated accordingly.

### `sdks/copilot/src/wrap-execute.ts`

Add an outer catch-all around the existing inner execution logic:

```typescript
export function wrapExecute<I, O>(spec: WrappableSpec, userExecute: UserExecute<I, O>) {
  return async function wrappedExecute(input: I, ctx: WrappableCtx): Promise<O | undefined> {
    try {
      return await innerWrap(spec, userExecute, input, ctx);
    } catch (err) {
      const structured = toCopilotToolError(err, spec.id);
      // AC4: full internal detail only in logs
      console.error('[copilot.tool-error]', {
        toolId: spec.id,
        code: structured.code,
        retryable: structured.retryable,
        internalDetail: structured.internalDetail,
        stack: err instanceof Error ? err.stack : undefined,
      });
      // AC3: throw with .message = userMessage — Mastra never sees internalDetail
      throw structured;
    }
  };
}
```

The `toCopilotToolError` helper (private, not exported):

```typescript
const DOMAIN_CODE_MAP: Record<string, { code: CopilotToolErrorCode; retryable: boolean; userMessage: string }> = {
  FORBIDDEN:    { code: 'PERMISSION_DENIED', retryable: false, userMessage: 'You do not have permission to perform this action.' },
  NOT_FOUND:    { code: 'NOT_FOUND',         retryable: false, userMessage: 'The requested resource was not found.' },
  CONFLICT:     { code: 'CONFLICT',          retryable: false, userMessage: 'A conflict prevented this operation.' },
  VALIDATION:   { code: 'VALIDATION',        retryable: false, userMessage: 'The request was invalid. Check the inputs and try again.' },
  rate_limited: { code: 'RATE_LIMITED',      retryable: true,  userMessage: 'Rate limit reached. The agent will retry shortly.' },
};

function toCopilotToolError(err: unknown, toolId: string): CopilotToolError {
  if (err instanceof CopilotToolError) return err; // already structured (covers Timeout, Breaker)

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
```

### `sdks/copilot/src/index.ts`

Export `CopilotToolError` and `CopilotToolErrorCode` alongside the existing error exports.

## Testing

### New unit test: `sdks/copilot/tests/unit/wrap-execute-error-mapping.test.ts`

Covers the `toCopilotToolError` mapping logic via `defineCopilotTool`:

| Input thrown | Expected `CopilotToolError.code` | `retryable` | `.message === userMessage` |
|---|---|---|---|
| `{ code: 'FORBIDDEN' }` | `PERMISSION_DENIED` | `false` | ✓ |
| `{ code: 'NOT_FOUND' }` | `NOT_FOUND` | `false` | ✓ |
| `{ code: 'CONFLICT' }` | `CONFLICT` | `false` | ✓ |
| `{ code: 'VALIDATION' }` | `VALIDATION` | `false` | ✓ |
| `{ code: 'rate_limited' }` | `RATE_LIMITED` | `true` | ✓ |
| `Error('boom')` (no `.code`) | `TOOL_ERROR` | `false` | ✓ |
| `new CopilotToolError(...)` | re-throw as-is | — | ✓ |
| `new ToolExecutionTimeoutError(...)` | `TIMEOUT` (from base) | `true` | ✓ |

Each test asserts `err instanceof CopilotToolError` (AC1), `err.message === err.userMessage` (AC3), and that `internalDetail` is not exposed via `.message`.

### Update existing test: `packages/copilot/tests/integration/tool-timeout.integration.test.ts`

Change `code: 'tool_execution_timeout'` → `code: 'TIMEOUT'`.

## Files Changed

| File | Change |
|---|---|
| `sdks/copilot/src/errors.ts` | Add `CopilotToolError` + `CopilotToolErrorCode`; refactor `ToolExecutionTimeoutError` + `ToolBreakerOpenError` to extend it |
| `sdks/copilot/src/wrap-execute.ts` | Add outer catch-all + `toCopilotToolError` helper |
| `sdks/copilot/src/index.ts` | Export `CopilotToolError`, `CopilotToolErrorCode` |
| `sdks/copilot/tests/unit/wrap-execute-error-mapping.test.ts` | New unit test |
| `packages/copilot/tests/integration/tool-timeout.integration.test.ts` | Update code assertion `'tool_execution_timeout'` → `'TIMEOUT'` |

## Out of Scope

- Changing how routes.ts renders `errorText` in the UI — the fix is upstream (`.message = userMessage`).
- Per-tool custom `userMessage` overrides from tool authors — tool authors can throw `CopilotToolError` directly if they need a specific user-facing message.
- Structured error reporting to external tracing (Sentry, OTEL) — a future concern.
- Specialist prompt instructions for error codes — a follow-up after this taxonomy is stable.
