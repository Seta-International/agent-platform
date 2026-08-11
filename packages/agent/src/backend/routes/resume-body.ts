import { z } from 'zod';

/** Logical workflow ids that own an agentic chat approval card. The row's
 *  workflow_id is the source of truth for which body contract applies — the
 *  body never gets to choose. */
export const ASSIGNMENT_WORKFLOW_ID = 'planner.assignment-orchestrator';
export const ACTION_WORKFLOW_ID = 'planner.action';

/**
 * The payload-free contract every card created after FUT-804 uses. It SELECTS
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

/** The assignment card's shipped contract — byte-identical to today, kept alive
 *  until FUT-806 retrofits assignment onto A2. */
export const LegacyResumeBody = z.strictObject({
  approvalId: z.string().min(1),
  decision: z.enum(['approve', 'reject', 'modify']),
  overrideUserIds: z.array(z.string()).optional(),
  alternateIndices: z.array(z.number().int().min(0)).optional(),
  note: z.string().max(1000).optional(),
});
export type LegacyResumeBodyT = z.infer<typeof LegacyResumeBody>;

export type ParsedResumeBody =
  | { kind: 'generic'; body: GenericResumeBodyT }
  | { kind: 'legacy'; body: LegacyResumeBodyT };

function fail(code: 'validation_failed' | 'not_supported', message: string): never {
  throw Object.assign(new Error(`${code}: ${message}`), { code });
}

/**
 * Parses the RAW request body with the schema that belongs to `workflowId`.
 *
 * Deliberately not a `z.union` discriminated by the body's own shape: the
 * workflow is already known from the persisted row, and letting the body pick
 * its own contract is what makes a stale client able to steer a new mutation.
 */
export function parseResumeBodyForWorkflow(workflowId: string, raw: unknown): ParsedResumeBody {
  if (workflowId === ACTION_WORKFLOW_ID) {
    const r = GenericResumeBody.safeParse(raw);
    if (!r.success) fail('validation_failed', 'body does not match this approval');
    return { kind: 'generic', body: r.data };
  }
  if (workflowId === ASSIGNMENT_WORKFLOW_ID) {
    const r = LegacyResumeBody.safeParse(raw);
    if (!r.success) fail('validation_failed', 'body does not match this approval');
    return { kind: 'legacy', body: r.data };
  }
  fail('not_supported', `no resume contract for workflow ${workflowId}`);
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
