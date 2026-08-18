// packages/planner/tests/fixtures/golden/schema.ts
//
// Typed, `kind`-discriminated schema for golden eval cases (spec §D/§E/§F).
// YAML case files are validated against this zod schema before the loader
// down-projects them to the harness EvalCase. The discriminator `kind` selects
// agent | retrieval | conversation shapes.
import { z } from 'zod';

const Behavior = z.enum([
  'answer',
  'empty',
  'clarify',
  'refuse',
  'partial',
  'error-recovery',
  // A2 write terminal states (FUT-825). `confirm` = the turn stopped at a preview
  // card and wrote nothing; `applied` = the change was written after the user
  // pressed Confirm. No A1 case can observe either: `planner-query`'s
  // `forbiddenTools` denies every write tool, so no query turn can ever suspend.
  'confirm',
  'applied',
  // A decision turn where the user cancelled. Its terminal state is neither
  // `confirm` (no card is left) nor `applied` (nothing was written), and the lane
  // reaches it by NOT resuming — deterministic by construction.
  'declined',
]);
const Suites = z.array(z.enum(['smoke', 'regression', 'nightly'])).min(1);

const Trajectory = z
  .object({
    requiredTools: z.array(z.string()).default([]),
    allowedTools: z.array(z.string()).default([]),
    forbiddenTools: z.array(z.string()).default([]),
    requiredPartialOrder: z
      .array(z.object({ before: z.string(), after: z.array(z.string()) }))
      .default([]),
    argPredicates: z
      .array(
        z.object({
          tool: z.string(),
          path: z.string(),
          operator: z.enum(['equals', 'subsetOf', 'notEquals']),
          value: z.unknown(),
        }),
      )
      .default([]),
    maxToolCalls: z.number().int().positive().optional(),
    // Opt-in for the A1 anti-fabrication gate: when true, every standalone number
    // in the answer must be traceable to a successful tool result or the user's
    // text. Set on count/overview/detail cases (PQ-003/008/012b) where the model
    // has historically invented figures.
    groundNumbers: z.boolean().optional(),
  })
  .partial();

/**
 * What a turn asked of the database.
 *
 * `'none'` is the only automated statement that BR-03 ("no write without an
 * explicit confirmation") holds for a model-driven turn, and it is what every
 * `confirm` turn declares. The row form asserts the effect of a Confirm.
 *
 * `after[].id` may be a `fixtures.<name>` reference; the driver resolves it
 * against the ids the case's fixture builders returned, so no case hard-codes a
 * uuid. Column names are the TABLE's (`due_at`, `priority`, `progress`,
 * `deleted_at`) — not the model's vocabulary.
 */
const DbEffects = z.union([
  z.literal('none'),
  z.object({
    rowsChanged: z.number().int().nonnegative(),
    after: z
      .array(
        z
          .object({ table: z.string(), id: z.string() })
          .catchall(z.union([z.string(), z.number(), z.boolean(), z.null()])),
      )
      .default([]),
  }),
]);

const Expected = z.object({
  behavior: Behavior,
  facts: z.array(z.object({ ref: z.string(), assertion: z.enum(['equals']) })).default([]),
  trajectory: Trajectory.optional(),
  output: z
    .object({
      requiredFactRefs: z.array(z.string()).default([]),
      forbiddenEntities: z.array(z.string()).default([]),
      forbiddenText: z.array(z.string()).default([]),
    })
    .partial()
    .optional(),
  dbEffects: DbEffects.optional(),
});
export type Expected = z.infer<typeof Expected>;

const Base = z.object({
  schemaVersion: z.literal(1),
  id: z.string(),
  suites: Suites,
  holdout: z.boolean().default(false),
  tags: z.array(z.string()).default([]),
  metricOverrides: z
    .record(z.string(), z.object({ mode: z.enum(['gate', 'advisory']), reason: z.string() }))
    .optional(),
});

const AgentCase = Base.extend({
  kind: z.literal('agent'),
  category: z.string(),
  actor: z.object({ tenantId: z.string(), userId: z.string() }),
  preconditions: z
    .object({
      expectedRoles: z.array(z.string()).default([]),
      expectedGroupIds: z.array(z.string()).default([]),
      forbiddenGroupIds: z.array(z.string()).default([]),
    })
    .partial()
    .optional(),
  input: z.object({
    messages: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string() })),
  }),
  expected: Expected,
  execution: z
    .object({
      toolFaults: z.array(
        z.object({
          tool: z.string(),
          whenCall: z.number().int(),
          error: z.object({ type: z.string(), message: z.string() }),
        }),
      ),
    })
    .optional(),
  metrics: z.object({ enabled: z.array(z.string()) }),
});

const RetrievalCase = Base.extend({
  kind: z.literal('retrieval'),
  query: z.string(),
  tenantId: z.string(),
  relevance: z
    .record(z.string(), z.number().int().min(0).max(3))
    .refine((r) => Object.keys(r).length > 0, 'relevance must be non-empty'),
  evaluation: z
    .object({ k: z.array(z.number().int().positive()).default([1, 3, 5]) })
    .default({ k: [1, 3, 5] }),
});

/** A turn the USER speaks. */
const UserTurn = z.object({ user: z.string(), expected: Expected }).strict();

/** A turn where the user acts on the card in front of them. `primary` is Confirm;
 *  `decline` is Cancel and the lane simply does not resume — which is why "cancel
 *  writes nothing" needs no mechanism at all. */
const DecisionTurn = z
  .object({
    decision: z.object({
      chosen: z.enum(['primary', 'alternate', 'decline']),
      alternateIndex: z.number().int().nonnegative().optional(),
      note: z.string().optional(),
    }),
    expected: Expected,
  })
  .strict();

const ConversationCase = Base.extend({
  kind: z.literal('conversation'),
  category: z.string().optional(),
  actor: z.object({ tenantId: z.string(), userId: z.string() }),
  /** Named builders from `action/fixtures.ts`, run inside the A2 tenant's per-case
   *  reset. A2-corpus-only; which agent a case belongs to is decided by its
   *  DIRECTORY, not by a field. */
  fixtures: z.array(z.string()).default([]),
  // Optional only because A1 has no conversation case authoring metrics; every A2
  // case declares it, and FUT-829's self-tests enforce that.
  metrics: z.object({ enabled: z.array(z.string()) }).optional(),
  turns: z.array(z.union([UserTurn, DecisionTurn])).min(1),
}).strict(); // no case-level `expected` allowed

export const GoldenCaseSchema = z.discriminatedUnion('kind', [
  AgentCase,
  RetrievalCase,
  ConversationCase,
]);
export type GoldenCase = z.infer<typeof GoldenCaseSchema>;
