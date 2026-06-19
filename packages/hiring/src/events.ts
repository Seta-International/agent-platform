import { z } from 'zod';

export const requisitionOpenedPayload = z.object({
  requisition_id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  resource_request_id: z.string().uuid().optional(),
});
export type RequisitionOpenedPayload = z.infer<typeof requisitionOpenedPayload>;

export const HIRING_REQUISITION_OPENED = 'hiring.requisition.opened';

export const HIRING_EVENTS = {
  'hiring.requisition.opened': requisitionOpenedPayload,
} as const satisfies Record<string, z.ZodSchema>;
