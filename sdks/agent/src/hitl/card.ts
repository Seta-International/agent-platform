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
  }),
});

export type ApprovalCard = z.infer<typeof ApprovalCardSchema>;
export type ApprovalDetailBlock = z.infer<typeof ApprovalDetailBlockSchema>;
export type CandidateRow = z.infer<typeof CandidateRowSchema>;
