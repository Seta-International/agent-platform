import type { SessionScope } from '@seta/core';
import { withEmit } from '@seta/core/events';
import type { NodeTx } from '@seta/shared-types';
import { and, eq, isNull } from 'drizzle-orm';
import { plannerDb } from '../../db/index.ts';
import { labels, plans } from '../../db/schema.ts';
import type { PlanRow, TaskExternalSource } from '../dto.ts';
import type { SetCategoryDescriptionsInput } from '../inputs.ts';
import { PlannerError } from '../rbac.ts';
import { attachLabelToCategorySlotTx } from './attach-label-to-category-slot.ts';
import { setCategoryDescriptionTx } from './set-category-description.ts';

type PlanDbRow = typeof plans.$inferSelect;

function rowToDto(row: PlanDbRow): PlanRow {
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    group_id: row.group_id,
    name: row.name,
    category_descriptions: (row.category_descriptions ?? {}) as Record<string, string>,
    external_source: row.external_source as TaskExternalSource,
    external_id: row.external_id,
    external_etag: row.external_etag,
    external_synced_at: row.external_synced_at?.toISOString() ?? null,
    created_by: row.created_by,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
    deleted_at: row.deleted_at?.toISOString() ?? null,
    version: row.version,
  };
}

async function detachLabelFromSlotTx(
  tx: NodeTx,
  args: {
    plan_id: string;
    slot: number;
    session: SessionScope;
  },
): Promise<void> {
  const [row] = await tx
    .select({ id: labels.id })
    .from(labels)
    .where(
      and(
        eq(labels.plan_id, args.plan_id),
        eq(labels.category_slot, args.slot),
        isNull(labels.deleted_at),
      ),
    )
    .limit(1);
  if (!row) return;
  await attachLabelToCategorySlotTx(tx, {
    plan_id: args.plan_id,
    label_id: row.id,
    slot: null,
    session: args.session,
  });
}

export async function setCategoryDescriptions(
  input: SetCategoryDescriptionsInput & { session: SessionScope },
): Promise<PlanRow> {
  await withEmit(
    {
      actor: {
        userId: input.session.user_id,
        tenantId: input.session.tenant_id,
      },
    },
    async (tx) => {
      for (const [slotStr, entry] of Object.entries(input.slots)) {
        const slot = Number(slotStr);
        if ('name' in entry) {
          await setCategoryDescriptionTx(tx, {
            plan_id: input.plan_id,
            slot,
            name: entry.name,
            session: input.session,
          });
        }
        if ('label_id' in entry && entry.label_id !== undefined) {
          // label_id === null means detach the currently attached label from this slot.
          // label_id === <uuid> means attach this label to this slot.
          if (entry.label_id === null) {
            await detachLabelFromSlotTx(tx, {
              plan_id: input.plan_id,
              slot,
              session: input.session,
            });
          } else {
            await attachLabelToCategorySlotTx(tx, {
              plan_id: input.plan_id,
              label_id: entry.label_id,
              slot,
              session: input.session,
            });
          }
        }
      }
    },
  );

  const db = plannerDb();
  const [row] = await db.select().from(plans).where(eq(plans.id, input.plan_id)).limit(1);
  if (!row) {
    throw new PlannerError('NOT_FOUND', 'Plan not found', { plan_id: input.plan_id });
  }
  return rowToDto(row);
}
