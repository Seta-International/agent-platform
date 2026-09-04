import { TASK_REF_DESCRIPTION } from '@seta/agent-sdk';
import { z } from 'zod';
import { UpdateTaskPatchSchema } from '../../inputs.ts';

/** The six fields people actually say out loud (design D4). `bucket_id` is
 *  excluded: it needs a bucket name→id resolution *per each task's own plan*,
 *  plus answers for "this plan has no bucket with that name" and "two buckets
 *  share a name". FUT-805 D4 moved it to its own story — it does NOT arrive
 *  with FUT-805 AC1, whatever FUT-804 §7 says. */
export const UpdateTaskActionPatchSchema = UpdateTaskPatchSchema.pick({
  title: true,
  description: true,
  due_at: true,
  start_at: true,
  priority_number: true,
  percent_complete: true,
});
export type UpdateTaskActionPatch = z.infer<typeof UpdateTaskActionPatchSchema>;

/** The words the model uses for priority. Identical to `planner_getTask`'s
 *  `priority` output field, so one vocabulary crosses the whole allowlist
 *  (docs/agent/tools.md §5.3). */
export const PriorityWordSchema = z.enum(['urgent', 'important', 'medium', 'low']);
export type PriorityWord = z.infer<typeof PriorityWordSchema>;

/** Ditto for progress — the `status` vocabulary planner_queryTasks returns.
 *  `deferred` is deliberately absent: deferring is a different operation
 *  (`is_deferred`), not a status this tool sets. */
export const ProgressWordSchema = z.enum(['not_started', 'in_progress', 'completed']);
export type ProgressWord = z.infer<typeof ProgressWordSchema>;

export const PRIORITY_NUMBER_BY_WORD: Record<PriorityWord, 1 | 3 | 5 | 9> = {
  urgent: 1,
  important: 3,
  medium: 5,
  low: 9,
};
export const PERCENT_COMPLETE_BY_WORD: Record<ProgressWord, 0 | 50 | 100> = {
  not_started: 0,
  in_progress: 50,
  completed: 100,
};

/**
 * Fields to REMOVE from the merged proposal (design D17).
 *
 * The merge alone cannot express "đừng đổi priority nữa" — dropping a field
 * without setting a value — and `priority`/`status` are word enums with no `null`
 * branch, so `null` is not a workaround. Dropping can only ever NARROW the
 * change, which is what makes it AC5-safe by construction.
 */
export const DropFieldsSchema = z
  .array(z.string())
  .optional()
  .describe(
    'Fields the user wants left ALONE after all, while the rest of the proposal stands. ' +
      'Only meaningful when adjusting the open preview. Use the same field names this ' +
      'tool accepts.',
  );

/**
 * Is the user ADDING to the open proposal, or NARROWING it? (design D20)
 *
 * The one question in this flow that is irreducibly language and therefore the
 * model's to answer. Everything else Part 4 moved to the server, but no amount of
 * server state distinguishes "và priority Urgent nữa" from "không phải, chỉ đổi
 * ngày thôi" — both arrive as a one-field patch on an open two-field proposal.
 *
 * Absent or false → merge: the proposal keeps every field the user already agreed
 * to. True → the proposal ends up containing ONLY the fields named now, and the
 * SERVER computes which of the previous ones to drop. Guessed wrong, the result is
 * visible on the card and correctable in one more sentence — which is the whole
 * reason this is a boolean and `revisionOf` was not.
 */
export const CorrectionSchema = z
  .boolean()
  .optional()
  .describe(
    'true when the user is CORRECTING the open preview so it should contain only what ' +
      'they just named — "không phải", "chỉ ... thôi", "à thôi", "instead", "no wait". ' +
      'Absent or false when they are ADDING to it — "và ... nữa", "also". Ignored when ' +
      'no preview is open.',
  );

/** Model field name → the key the CARD's persisted patch uses. The model speaks
 *  camelCase (`dueAt`, `priority`); the card persists the domain vocabulary
 *  (`due_at`, `priority_number`), so `dropFields` needs this to find the field it
 *  is being asked to remove. */
export const DOMAIN_FIELD_BY_TOOL_FIELD: Record<string, keyof UpdateTaskActionPatch> = {
  title: 'title',
  description: 'description',
  dueAt: 'due_at',
  startAt: 'start_at',
  priority: 'priority_number',
  status: 'percent_complete',
};

/** The create-draft fields a revision may drop. `title` is absent on purpose: the
 *  draft schema requires it, so dropping it would produce an unbuildable card. */
export const CREATE_DRAFT_FIELDS = [
  'description',
  'dueAt',
  'startAt',
  'priority',
  'labels',
] as const;

/**
 * The preview the SERVER found open for this turn.
 *
 * Injected through the run input, never through tool arguments — that separation
 * is what makes design D20 enforceable: the model contributes no part of the
 * card's identity, so the server alone decides which preview a turn adjusts.
 *
 * `proposedRows` are the card's own `kvTable` rows, reused verbatim rather than
 * re-rendered: they already carry resolved names, priority WORDS and formatted
 * dates, so the prompt shows the model exactly what the user is looking at with
 * no second formatter and no name lookup.
 */
export const OpenPreviewSchema = z.object({
  approvalId: z.string(),
  toolId: z.string(),
  /** The card's `intent`, e.g. `Update "Deploy API"` — it names the task, which
   *  design D19 requires A2 to echo back. */
  intent: z.string(),
  /** The tasks the card is about, read off its persisted argsPatch. The server
   *  matches these against the tasks the turn resolved to decide whether this
   *  call adjusts the card or is a new request (design D20). Empty for a create
   *  draft, which has no task yet. */
  taskIds: z.array(z.string()),
  proposedRows: z.array(z.object({ k: z.string(), v: z.string() })),
});
export type ActionOpenPreview = z.infer<typeof OpenPreviewSchema>;

/** What the MODEL may produce — the model-facing vocabulary, which is NOT the
 *  domain vocabulary (docs/agent/tools.md §5.3, §5.4):
 *   - camelCase field names, matching what `planner_getTask` returns;
 *   - `priority`/`status` as WORDS, never the 1/3/5/9 and 0/50/100 numbers the
 *     table stores — the model knows the vocabulary, not the data encoding;
 *   - dates looser than the domain schema (a bare `YYYY-MM-DD` is allowed)
 *     because the tool normalises them in code — see date-normalize.ts.
 *  `.strict()` so a model reaching for the old numeric fields fails loudly
 *  instead of silently dropping the change the user asked for.
 *  Everything is re-validated against UpdateTaskActionPatchSchema after mapping. */
export const ToolPatchSchema = z
  .object({
    title: z.string().min(1).optional(),
    description: z.string().nullable().optional(),
    dueAt: z
      .string()
      .min(10)
      .nullable()
      .optional()
      .describe(
        'ISO-8601: YYYY-MM-DD, or a full timestamp with offset. Never a relative phrase. ' +
          'null clears the due date.',
      ),
    startAt: z
      .string()
      .min(10)
      .nullable()
      .optional()
      .describe(
        'ISO-8601: YYYY-MM-DD, or a full timestamp with offset. Never a relative phrase. ' +
          'null clears the start date.',
      ),
    priority: PriorityWordSchema.optional().describe(
      'The same four words planner_getTask reports in its `priority` field.',
    ),
    status: ProgressWordSchema.optional().describe(
      'The same words planner_queryTasks reports in its `status` field.',
    ),
  })
  .strict();
export type ToolPatch = z.infer<typeof ToolPatchSchema>;

/**
 * The hard ceiling on ONE tool call. Deliberately NOT a `.max()` on the schema
 * below: a Zod error is something the model reads and "helpfully" works around
 * by splitting the request into two batches — precisely what the AC forbids
 * ("refused with an explanation, and no task is updated"). Three layers, because
 * the first two are not enough alone: this constant, the tool's own refusal, and
 * a prompt sentence telling the model not to split.
 *
 * What that binds: one invocation never mutates more than 20 tasks. What it does
 * NOT bind: a whole agent run — nothing stops a model refused at 21 from calling
 * again with 10 then 11. Enforcing that needs per-run state surviving
 * suspend/resume, which is out of scope (design §7).
 */
export const BULK_TARGET_CAP = 20;

export const UpdateTaskToolInputSchema = z
  .object({
    taskRefs: z
      .array(z.string().trim().min(1))
      .min(1)
      .describe(
        `The tasks to change — one entry each, all receiving the SAME patch. At most ` +
          `${BULK_TARGET_CAP} per call; a larger request is refused, never split. ` +
          `When you are adjusting the preview shown in the OPEN PREVIEW block, list the ` +
          `same task it names — the proposal keeps its own tasks regardless. ` +
          `Each entry: ${TASK_REF_DESCRIPTION}`,
      ),
    patch: ToolPatchSchema,
    dropFields: DropFieldsSchema,
    correction: CorrectionSchema,
  })
  // `.strict()` to match its four siblings, and for the reason on
  // LinkTasksToolInputSchema: a model reaching for the REMOVED `revisionOf` must
  // fail loudly rather than get silence (FUT-824, design D20).
  .strict();

export const UpdateTaskToolOutputSchema = z.object({
  updated: z.boolean(),
  taskIds: z.array(z.string()),
  /** Set when the write was refused for a reason the agent should explain. */
  refusal: z.string().nullable().optional(),
  /** Present ONLY on a successfully persisted revision (design D20). Its absence
   *  is what stops the assistant saying "đã cập nhật" after a refusal, and its
   *  pre-rendered strings are what stop it inventing a weekday. */
  revised: z
    .object({
      approvalId: z.string(),
      taskTitle: z.string(),
      diff: z.array(z.object({ field: z.string(), from: z.string(), to: z.string() })),
    })
    .optional(),
});

export const UpdateTaskSuspendSchema = z.object({
  card: z.unknown(),
  /** The rendered diff of a revision, so the sentence the model writes after the
   *  card appears quotes stored values instead of deriving them. */
  revised: z.unknown().optional(),
});

/** One target of a batch. `expectedVersion` is per task, so a batch of ten in
 *  which one task moved since the preview conflicts as a whole (design §5). */
export const UpdateTaskTargetSchema = z.object({
  taskId: z.string(),
  expectedVersion: z.number().int().nonnegative(),
});
export type UpdateTaskTarget = z.infer<typeof UpdateTaskTargetSchema>;

/** The resume payload. It is READ OFF THE PERSISTED CARD, never off the confirm
 *  request — that is FUT-804 AC5 and the reason no field here is client-supplied.
 *  One shape for one target and for twenty. */
export const UpdateTaskResumeSchema = z
  .object({
    action: z.enum(['update', 'decline']),
    targets: z.array(UpdateTaskTargetSchema).min(1),
    patch: UpdateTaskActionPatchSchema.optional(),
    idempotencyKey: z.string().optional(),
  })
  .strict();
export type UpdateTaskResume = z.infer<typeof UpdateTaskResumeSchema>;

/** Everything the card needs about the task as it stands before the change. */
export interface ActionTaskSnapshot {
  taskId: string;
  title: string;
  description: string | null;
  due_at: string | null;
  start_at: string | null;
  priority_number: 1 | 3 | 5 | 9;
  percent_complete: number;
  version: number;
  groupId: string;
}

/** The three kinds `planner.task_links` stores. Kept as a literal rather than
 *  imported from `db/schema.ts`, so the model-facing vocabulary and the storage
 *  enum can diverge without a silent coupling. */
export const TaskLinkKindSchema = z.enum(['relates', 'duplicates', 'blocks']);
export type ToolTaskLinkKind = z.infer<typeof TaskLinkKindSchema>;

export const LinkTasksToolInputSchema = z
  .object({
    sourceTaskRef: z.string().trim().min(1).describe(TASK_REF_DESCRIPTION),
    targetTaskRef: z.string().trim().min(1).describe(TASK_REF_DESCRIPTION),
    kind: TaskLinkKindSchema.describe(
      'relates = the two tasks are connected, symmetric. ' +
        'duplicates = the SOURCE task is a duplicate of the target. ' +
        'blocks = the SOURCE task blocks the target. ' +
        'When the user just says "link" or "related", use relates.',
    ),
  })
  // `.strict()` to match its three siblings: with dropFields meaningless here, a
  // model that passes one must fail loudly rather than get silence (design D17).
  .strict();

export const LinkTasksToolOutputSchema = z.object({
  linked: z.boolean(),
  linkId: z.string().nullable(),
  refusal: z.string().nullable().optional(),
});

export const LinkTasksSuspendSchema = z.object({ card: z.unknown() });

/** Read off the persisted card, never off the confirm request. */
export const LinkTasksResumeSchema = z
  .object({
    action: z.enum(['link', 'decline']),
    sourceTaskId: z.string(),
    targetTaskId: z.string(),
    kind: TaskLinkKindSchema,
    idempotencyKey: z.string().optional(),
  })
  .strict();
export type LinkTasksResume = z.infer<typeof LinkTasksResumeSchema>;

/**
 * Everything `makeActionResumer` may be handed. Mastra routes a resume payload to
 * the suspended tool by `toolCallId`, and each tool re-parses with its own schema
 * — so this union only types the resumer's parameter. It is NOT a dispatcher.
 */
/**
 * Two NAMED refs. Not `taskRefs: [a, b]` and not one link tool with a `mode`
 * (design D6): the two arguments are not interchangeable, because one of them
 * ends up in the trash. A transposition here is a wrong task deleted, so the
 * shape makes transposition unrepresentable rather than merely discouraged.
 */
export const MergeTasksToolInputSchema = z
  .object({
    duplicateTaskRef: z
      .string()
      .trim()
      .min(1)
      .describe(`The task that will be SENT TO TRASH. ${TASK_REF_DESCRIPTION}`),
    keepTaskRef: z
      .string()
      .trim()
      .min(1)
      .describe(`The task that SURVIVES. ${TASK_REF_DESCRIPTION}`),
  })
  .strict();

export const MergeTasksToolOutputSchema = z.object({
  merged: z.boolean(),
  keptTaskId: z.string().nullable(),
  refusal: z.string().nullable().optional(),
});

export const MergeTasksSuspendSchema = z.object({ card: z.unknown() });

/**
 * Only the duplicate carries a version. A merge does not modify the keeper — it
 * only adds an inbound link row — so binding the keeper's version would fail
 * merges for a reason the user cannot see on the card. `.strict()` is what keeps
 * a well-meaning `keepExpectedVersion` from reappearing later.
 */
export const MergeTasksResumeSchema = z
  .object({
    action: z.enum(['merge', 'decline']),
    duplicateTaskId: z.string(),
    duplicateExpectedVersion: z.number().int(),
    keepTaskId: z.string(),
    idempotencyKey: z.string().optional(),
  })
  .strict();
export type MergeTasksResume = z.infer<typeof MergeTasksResumeSchema>;

/** One call may not name more than this many people. A card listing thirty
 *  names is not a preview anybody reads. */
export const ASSIGNEE_CAP = 10;

export const AssignTaskToolInputSchema = z
  .object({
    taskRef: z.string().trim().min(1).describe(TASK_REF_DESCRIPTION),
    assigneeRefs: z
      .array(z.string().trim().min(1))
      .min(1)
      .max(ASSIGNEE_CAP)
      .describe(
        'The COMPLETE list of people who should be assigned after this change — display ' +
          'names, emails or user UUIDs. This REPLACES the current assignees, so to add ' +
          'somebody alongside the current owners you must list the current owners too. ' +
          'Call planner_getTask first whenever the request is relative to whoever owns the ' +
          'task now ("thay B bằng A", "giao thêm cho A", "bỏ B ra").',
      ),
  })
  .strict();

export const AssignTaskToolOutputSchema = z.object({
  assigned: z.boolean(),
  assigneeUserIds: z.array(z.string()),
  refusal: z.string().nullable().optional(),
});

export const AssignTaskSuspendSchema = z.object({ card: z.unknown() });

/**
 * Read off the persisted card, never off the confirm request. `assigneeUserIds`
 * is the FINAL set — the same array `setAssignees` receives — so the resume pass
 * never has to work out what "add" or "remove" meant.
 */
export const AssignTaskResumeSchema = z
  .object({
    action: z.enum(['assign', 'decline']),
    taskId: z.string(),
    assigneeUserIds: z.array(z.string()).optional(),
    idempotencyKey: z.string().optional(),
  })
  .strict();
export type AssignTaskResume = z.infer<typeof AssignTaskResumeSchema>;

/**
 * The draft as the card persists it: already-normalised instants and the
 * priority WORD, so the resume pass converts nothing. Whatever the user
 * previewed is exactly what `createTask` receives.
 */
export const CreateTaskDraftSchema = z
  .object({
    title: z.string().trim().min(1).max(280),
    description: z.string().optional(),
    dueAt: z.string().optional(),
    startAt: z.string().optional(),
    priority: PriorityWordSchema.optional(),
    labels: z.array(z.string()).optional(),
  })
  .strict();
export type CreateTaskDraft = z.infer<typeof CreateTaskDraftSchema>;

export const CreateTaskToolInputSchema = z
  .object({
    planRef: z
      .string()
      .trim()
      .min(1)
      .describe(
        "The plan's UUID, or its exact name. Every task lives in a plan; if the user has " +
          'not said which one and the conversation does not make it obvious, ASK — do not ' +
          'guess a plan.',
      ),
    title: z.string().trim().min(1).max(280),
    description: z.string().optional(),
    dueAt: z
      .string()
      .min(10)
      .optional()
      .describe('YYYY-MM-DD or a full offset. Resolve relative phrases BEFORE calling.'),
    startAt: z.string().min(10).optional().describe('YYYY-MM-DD or a full offset.'),
    priority: PriorityWordSchema.optional(),
    labels: z.array(z.string()).optional().describe('Label names; they are matched by name.'),
    // No bucketRef, no assigneeRefs, no status (design D8). A new task is
    // not_started, and assigning is a separate turn with its own preview.
    dropFields: DropFieldsSchema,
  })
  .strict();

export const CreateTaskToolOutputSchema = z.object({
  created: z.boolean(),
  taskId: z.string().nullable(),
  usedExisting: z.boolean().optional(),
  refusal: z.string().nullable().optional(),
});

export const CreateTaskSuspendSchema = z.object({ card: z.unknown() });

export const CreateTaskResumeSchema = z
  .object({
    action: z.enum(['create', 'use_existing', 'decline']),
    planId: z.string().optional(),
    // Sibling of planId, not part of the draft: both are ids the SERVER
    // resolved, not fields the user typed. Optional so a card minted before this
    // shipped still parses and reaches the "incomplete preview" refusal, instead
    // of throwing a Zod error at the user — .strict() would reject it outright.
    bucketId: z.string().optional(),
    draft: CreateTaskDraftSchema.optional(),
    existingTaskId: z.string().optional(),
    idempotencyKey: z.string().optional(),
  })
  .strict();
export type CreateTaskResume = z.infer<typeof CreateTaskResumeSchema>;

/** The domain function rejects anything longer, so the schema rejects it first
 *  and the model gets a usable message instead of a thrown PlannerError. */
export const COMMENT_MAX_LEN = 4000;

export const CommentTaskToolInputSchema = z
  .object({
    taskRef: z.string().trim().min(1).describe(TASK_REF_DESCRIPTION),
    body: z
      .string()
      .trim()
      .min(1)
      .max(COMMENT_MAX_LEN)
      .describe('The comment text, exactly as it should appear. Plain text.'),
  })
  .strict();

export const CommentTaskToolOutputSchema = z.object({
  commented: z.boolean(),
  commentId: z.string().nullable(),
  refusal: z.string().nullable().optional(),
});

export const CommentTaskSuspendSchema = z.object({ card: z.unknown() });

/** The body travels on the CARD, not in the confirm request: the user agreed to
 *  the text they read, and no client gets to substitute another one. */
export const CommentTaskResumeSchema = z
  .object({
    action: z.enum(['comment', 'decline']),
    taskId: z.string(),
    body: z.string().optional(),
    idempotencyKey: z.string().optional(),
  })
  .strict();
export type CommentTaskResume = z.infer<typeof CommentTaskResumeSchema>;

export const ActionResumeSchema = z.union([
  UpdateTaskResumeSchema,
  LinkTasksResumeSchema,
  MergeTasksResumeSchema,
  AssignTaskResumeSchema,
  CreateTaskResumeSchema,
  CommentTaskResumeSchema,
]);
export type ActionResume =
  | UpdateTaskResume
  | LinkTasksResume
  | MergeTasksResume
  | AssignTaskResume
  | CreateTaskResume
  | CommentTaskResume;
