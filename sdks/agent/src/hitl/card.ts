import { z } from 'zod';

export const CandidateRowSchema = z.object({
  id: z.string(),
  label: z.string(),
  secondary: z.string().optional(),
  score: z.number().optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
});

export const ApprovalDetailBlockSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('text'), body: z.string() }),
  z.object({
    kind: z.literal('kvTable'),
    rows: z.array(z.object({ k: z.string(), v: z.string() })),
  }),
  z.object({ kind: z.literal('candidateList'), items: z.array(CandidateRowSchema) }),
  z.object({ kind: z.literal('diff'), before: z.unknown(), after: z.unknown() }),
  z.object({ kind: z.literal('confirmationChecklist'), items: z.array(z.string()) }),
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
