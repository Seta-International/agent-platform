import { z } from 'zod';

export const CandidateRowSchema = z.object({
  id: z.string(),
  label: z.string(),
  secondary: z.string().optional(),
  score: z.number().optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
});

export const EntityRefSchema = z.object({
  id: z.string(),
  type: z.string(), // 'user' | 'task' | 'document' | … — resolves an entity renderer
  label: z.string(),
  secondary: z.string().optional(),
  score: z.number().optional(),
  primary: z.boolean().optional(), // the recommended/top choice
  meta: z.record(z.string(), z.unknown()).optional(),
});
export type EntityRef = z.infer<typeof EntityRefSchema>;

export const ApprovalDetailBlockSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('text'), body: z.string() }),
  z.object({
    kind: z.literal('kvTable'),
    rows: z.array(z.object({ k: z.string(), v: z.string() })),
  }),
  z.object({ kind: z.literal('candidateList'), items: z.array(CandidateRowSchema) }),
  z.object({ kind: z.literal('diff'), before: z.unknown(), after: z.unknown() }),
  z.object({ kind: z.literal('confirmationChecklist'), items: z.array(z.string()) }),
  z.object({
    kind: z.literal('entityList'),
    select: z.enum(['none', 'single', 'multi']).default('none'),
    items: z.array(EntityRefSchema),
  }),
  z.object({ kind: z.literal('confidence'), score: z.number(), label: z.string().optional() }),
  z.object({
    kind: z.literal('citations'),
    items: z.array(z.object({ kind: z.string(), id: z.string(), label: z.string().optional() })),
  }),
]);

export const ApprovalCardSchema = z.object({
  toolCallId: z.string(),
  intent: z.string(),
  riskBadge: z.enum(['write', 'destructive', 'external']),
  summary: z.string(),
  details: z.array(ApprovalDetailBlockSchema),
  primary: z.object({ label: z.string(), argsPatch: z.record(z.string(), z.unknown()).optional() }),
  alternates: z.array(
    z.object({ label: z.string(), argsPatch: z.record(z.string(), z.unknown()) }),
  ),
  // `argsPatch` is the resume payload to forward when the user picks decline /
  // primary / an alternate. By making it the same shape on every action, the
  // generic inbox approve/reject path can resume the workflow without having
  // to know about the workflow's specific resumeSchema discriminator.
  decline: z.object({
    label: z.string(),
    argsPatch: z.record(z.string(), z.unknown()).optional(),
  }),
  meta: z.object({
    tenantId: z.string(),
    userId: z.string(),
    agentPath: z.array(z.string()),
    toolId: z.string(),
    ts: z.string(),
    // Logical id of the runtime that must resume this card. /chat/resume picks
    // the resume body SCHEMA off the persisted row's workflow_id, so the card
    // has to name its own runtime: the agent tier may not import feature
    // modules and therefore cannot map tool ids to runtimes itself. Optional so
    // a card that declares nothing keeps the legacy assignment behaviour.
    workflowId: z.string().optional(),
    // Cards that MUST NOT coexist declare the same key. The agent tier compares
    // strings; it never learns which tool or module authored them. Optional so a
    // card that declares nothing has no mutex at all — the safe default, since a
    // wrongly-inherited mutex silently swallows a second, legitimate card.
    //
    // PLURAL because a bulk card covers up to 20 tasks and one string cannot
    // express "one preview per task" for 20 of them (design D10). An assign card
    // declares BOTH `assign:<id>` and `task:<id>`, in that order — the keys are
    // evaluated in DECLARATION ORDER and the first hit wins (design D11).
    dedupKeys: z.array(z.string()).optional(),
    /**
     * @deprecated Superseded by `dedupKeys`. Kept for ONE release so a card
     * persisted before FUT-840 is still seen by the assign mutex and still voided
     * by the supersede subscriber (spec §3.2). Delete once no pending row can
     * carry it — bounded by the 72-hour approval TTL.
     */
    dedupKey: z.string().optional(),
    // The approval this card REPLACES. Stamped by the tool's revision branch and
    // consumed by writeChatApprovalRow, which performs the supersede inside the
    // same transaction as the INSERT (design D8'). The card is the only channel
    // between the two, which is why this field exists at all.
    supersedes: z.string().uuid().optional(),
  }),
});

export type ApprovalCard = z.infer<typeof ApprovalCardSchema>;
export type ApprovalDetailBlock = z.infer<typeof ApprovalDetailBlockSchema>;
export type CandidateRow = z.infer<typeof CandidateRowSchema>;
