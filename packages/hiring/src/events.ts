import { z } from 'zod';

const uuid = z.string().uuid();

export const requisitionOpenedPayload = z.object({ requisition_id: uuid, tenant_id: uuid });
export const requisitionUpdatedPayload = z.object({
  requisition_id: uuid,
  tenant_id: uuid,
  fields: z.array(z.string()),
});
export const requisitionClosedPayload = z.object({
  requisition_id: uuid,
  tenant_id: uuid,
  status: z.enum(['filled', 'cancelled']),
});
export const openingOpenedPayload = z.object({
  opening_id: uuid,
  requisition_id: uuid,
  tenant_id: uuid,
  resource_request_id: uuid.optional(),
});
export const openingClosedPayload = z.object({
  opening_id: uuid,
  requisition_id: uuid,
  tenant_id: uuid,
  status: z.enum(['closed', 'cancelled']),
  reason_id: uuid.optional(),
});

export const HIRING_REQUISITION_OPENED = 'hiring.requisition.opened';
export const HIRING_REQUISITION_UPDATED = 'hiring.requisition.updated';
export const HIRING_REQUISITION_CLOSED = 'hiring.requisition.closed';
export const HIRING_OPENING_OPENED = 'hiring.opening.opened';
export const HIRING_OPENING_CLOSED = 'hiring.opening.closed';

export const HIRING_EVENTS = {
  [HIRING_REQUISITION_OPENED]: requisitionOpenedPayload,
  [HIRING_REQUISITION_UPDATED]: requisitionUpdatedPayload,
  [HIRING_REQUISITION_CLOSED]: requisitionClosedPayload,
  [HIRING_OPENING_OPENED]: openingOpenedPayload,
  [HIRING_OPENING_CLOSED]: openingClosedPayload,
} as const satisfies Record<string, z.ZodSchema>;
