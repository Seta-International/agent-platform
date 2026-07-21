// packages/planner/tests/fixtures/golden/schema.ts
//
// Typed, `kind`-discriminated schema for golden eval cases (spec §D/§E/§F).
// YAML case files are validated against this zod schema before the loader
// down-projects them to the harness EvalCase. The discriminator `kind` selects
// agent | retrieval | conversation shapes.
import { z } from 'zod';

const Behavior = z.enum(['answer', 'empty', 'clarify', 'refuse', 'partial', 'error-recovery']);
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
  })
  .partial();

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
});

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

const ConversationCase = Base.extend({
  kind: z.literal('conversation'),
  category: z.string().optional(),
  actor: z.object({ tenantId: z.string(), userId: z.string() }),
  turns: z.array(z.object({ user: z.string(), expected: Expected })).min(1),
}).strict(); // no case-level `expected` allowed

export const GoldenCaseSchema = z.discriminatedUnion('kind', [
  AgentCase,
  RetrievalCase,
  ConversationCase,
]);
export type GoldenCase = z.infer<typeof GoldenCaseSchema>;
