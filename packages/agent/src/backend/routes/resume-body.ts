import { z } from 'zod';

/** Logical workflow ids that own an agentic chat approval card. The row's
 *  workflow_id is the source of truth for which body contract applies — the
 *  body never gets to choose. */
export const ASSIGNMENT_WORKFLOW_ID = 'planner.assignment-orchestrator';
export const ACTION_WORKFLOW_ID = 'planner.action';

/**
 * The payload-free contract every chat card uses. It SELECTS
 * one of the actions the agent already authored and the server already
 * persisted; it never supplies a value.
 *
 * strictObject, not object: Zod 4 strips unknown keys by default, so a plain
 * object would accept a smuggled `patch`/`overrideUserIds`, drop it silently
 * and return 200. AC5 asks the API to REFUSE.
 */
export const GenericResumeBody = z
  .strictObject({
    approvalId: z.string().min(1),
    chosen: z.enum(['primary', 'alternate', 'decline']),
    alternateIndex: z.number().int().nonnegative().optional(),
    /** Audit metadata about the DECISION. Persisted on the approval row and the
     *  outbox event, never merged into argsPatch, never passed to a domain
     *  function. Capped so it stays metadata. */
    note: z.string().max(1000).optional(),
  })
  .refine((b) => (b.chosen === 'alternate') === (b.alternateIndex !== undefined), {
    message: 'alternateIndex is required for chosen="alternate" and forbidden otherwise',
    path: ['alternateIndex'],
  });
export type GenericResumeBodyT = z.infer<typeof GenericResumeBody>;

export type ParsedResumeBody = { kind: 'generic'; body: GenericResumeBodyT };

function fail(code: 'validation_failed' | 'not_supported', message: string): never {
  throw Object.assign(new Error(`${code}: ${message}`), { code });
}

/**
 * Parses the RAW request body with the schema that belongs to `workflowId`.
 *
 * Both chat runtimes now use ONE contract. The workflow-id parameter stays
 * rather than the function becoming a bare parse: the row's workflow_id is still
 * the authority on whether this approval is chat-resumable at all, and
 * `not_supported` is what keeps a misrouted evented row out.
 */
export function parseResumeBodyForWorkflow(workflowId: string, raw: unknown): ParsedResumeBody {
  if (workflowId !== ACTION_WORKFLOW_ID && workflowId !== ASSIGNMENT_WORKFLOW_ID) {
    fail('not_supported', `no resume contract for workflow ${workflowId}`);
  }
  const r = GenericResumeBody.safeParse(raw);
  if (!r.success) fail('validation_failed', 'body does not match this approval');
  return { kind: 'generic', body: r.data };
}

interface CardLike {
  primary?: { argsPatch?: Record<string, unknown> };
  alternates?: ReadonlyArray<{ argsPatch?: Record<string, unknown> }>;
  decline?: { argsPatch?: Record<string, unknown> };
}

/**
 * The resume payload for a generic card: read VERBATIM off the persisted card.
 * There is no mapping step and no client-supplied field on this path — that is
 * FUT-804 AC5 held by construction rather than by a filter.
 */
export function selectArgsPatch(
  proposedPayload: unknown,
  body: GenericResumeBodyT,
): Record<string, unknown> {
  const card = (proposedPayload ?? null) as CardLike | null;
  if (!card) fail('validation_failed', 'this approval has no stored preview');
  if (body.chosen === 'decline') return { ...(card.decline?.argsPatch ?? {}) };
  if (body.chosen === 'primary') return { ...(card.primary?.argsPatch ?? {}) };
  const alt = card.alternates?.[body.alternateIndex ?? -1];
  // An update card carries `alternates: []`, so every chosen:'alternate'
  // against an A2 card lands here.
  if (!alt) fail('validation_failed', 'alternateIndex is out of range for this approval');
  return { ...(alt.argsPatch ?? {}) };
}
