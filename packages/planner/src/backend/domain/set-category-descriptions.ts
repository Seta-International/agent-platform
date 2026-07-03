// rbac: delegates — body forwards to attachLabelToCategorySlotTx / setCategoryDescriptionTx
// in sibling files, both of which call requirePermission(session, ...) on the planner permission.
import type { SessionScope } from '@seta/core';
import { withEmit } from '@seta/core/events';
import type { NodeTx } from '@seta/shared-db';
import { and, eq, isNull } from 'drizzle-orm';
import { plannerDb } from '../db/index.ts';
import { labels, plans } from '../db/schema.ts';
import type { PlanRow } from '../dto.ts';
import type { SetCategoryDescriptionsInput } from '../inputs.ts';
import { PlannerError } from '../rbac.ts';
import { fetchCategoryDescriptions, planRowToDto } from './_plan-dto.ts';
import { attachLabelToCategorySlotTx } from './attach-label-to-category-slot.ts';
import { setCategoryDescriptionTx } from './set-category-description.ts';

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
      const [plan] = await tx
        .select()
        .from(plans)
        .where(and(eq(plans.id, input.plan_id), isNull(plans.deleted_at)))
        .limit(1);
      if (!plan) throw new PlannerError('NOT_FOUND', 'Plan not found', { plan_id: input.plan_id });
      if (plan.tenant_id !== input.session.tenant_id) {
        throw new PlannerError('CROSS_TENANT', 'Plan belongs to another tenant', {
          plan_id: input.plan_id,
        });
      }
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
  const categoryDescriptions = await fetchCategoryDescriptions(db, row.id);
  return planRowToDto(row, categoryDescriptions);
}
