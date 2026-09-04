import { RequestContext } from '@mastra/core/request-context';
import { type Mock, vi } from 'vitest';
import type { LoadedPreview } from '../../../../src/backend/orchestration/action/ports.ts';
import type { ActionOpenPreview } from '../../../../src/backend/orchestration/action/schemas.ts';

// ─────────────────────────────────────────────────────────────────────────────
// Shared scaffolding for the six A2 write tools' revision tests (FUT-840).
//
// One copy, not six. The alternative — the same preview-port fake pasted into
// six suites — is a test that silently stops proving anything the first time one
// copy drifts, which is precisely the "six per-tool merges drift apart" risk the
// spec's §8 names.
// ─────────────────────────────────────────────────────────────────────────────

/** The approval the SERVER injected for the turn. Every revision quotes this. */
export const OPEN_APPROVAL_ID = '7f3a1c2e-1111-4222-8333-444455556666';
/** A real, valid, same-actor approval id that is NOT the injected one. Design
 *  D15's whole point: this must be refused, not silently retargeted to. */
export const OTHER_APPROVAL_ID = '11112222-3333-4444-8555-666677778888';

export interface FakePreviewPort {
  loadPreview: Mock;
  takenDedupKeys: Mock;
}

/**
 * A `PreviewPort` fake.
 *
 * `loaded` omitted means "a valid update card exists"; pass `null` for "the row
 * is gone", or an object to shape `toolId` / `argsPatch` per case.
 * `taken` is the set of `task:` keys a pending card already holds.
 */
export function fakePreviewPort(
  over: { loaded?: LoadedPreview | null; taken?: string[] } = {},
): FakePreviewPort {
  return {
    loadPreview: vi.fn(async (_args: { approvalId: string }) =>
      over.loaded === undefined
        ? {
            approvalId: OPEN_APPROVAL_ID,
            toolId: 'planner_updateTask',
            argsPatch: {},
          }
        : over.loaded,
    ),
    takenDedupKeys: vi.fn(async (_args: { dedupKeys: string[] }) => over.taken ?? []),
  };
}

/** The `openPreview` the run context carries. Only `approvalId` is load-bearing;
 *  the rest exists so the shape matches what the router really sends. */
export function injectedPreview(
  over: { approvalId?: string; toolId?: string; taskIds?: string[] } = {},
): ActionOpenPreview {
  return {
    approvalId: over.approvalId ?? OPEN_APPROVAL_ID,
    toolId: over.toolId ?? 'planner_updateTask',
    intent: 'Update "AWS migration"',
    // Empty by default: a card whose tasks are unknown matches only a turn that
    // resolved none of its own. Every revision case names its task explicitly.
    taskIds: over.taskIds ?? [],
    proposedRows: [{ k: 'Due', v: '12 Aug 2026 → 15 Aug 2026' }],
  };
}

function rc(): RequestContext {
  const requestContext = new RequestContext();
  requestContext.set('tenant_id', 't1');
  requestContext.set('actor', { type: 'user', user_id: 'a1' });
  return requestContext;
}

/** A first-pass tool context: no resumeData, and a suspend the caller captures. */
export function firstPassCtx(suspend: (p: unknown) => Promise<unknown>) {
  return { agent: { suspend, resumeData: undefined }, requestContext: rc() } as never;
}

/** The card shape these tests assert against. Narrow on purpose: a test that
 *  reached for the full ApprovalCard type would have to satisfy fields it does
 *  not care about. */
export interface CapturedCard {
  meta: { supersedes?: string; dedupKeys?: string[]; toolId: string };
  primary: { argsPatch: Record<string, unknown> };
  details: Array<{ kind: string; rows?: Array<{ k: string; v: string }>; body?: string }>;
}

/**
 * Run a tool's FIRST pass and capture whatever it suspended with.
 *
 * `card` is undefined when the tool refused instead of suspending — which is the
 * assertion for every AC5 case, so it must be observable rather than thrown.
 */
export async function runFirstPass<T = { refusal?: string | null }>(
  tool: { execute?: (input: never, ctx: never) => Promise<unknown> },
  input: Record<string, unknown>,
): Promise<{ card: CapturedCard | undefined; out: T; suspend: Mock }> {
  let card: CapturedCard | undefined;
  const suspend = vi.fn(async (p: unknown) => {
    card = (p as { card?: CapturedCard }).card;
  });
  const out = (await tool.execute?.(input as never, firstPassCtx(suspend))) as T;
  return { card, out, suspend };
}
