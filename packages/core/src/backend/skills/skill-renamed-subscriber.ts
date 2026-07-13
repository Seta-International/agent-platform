import type { DomainEvent, SubscriberDef } from '@seta/shared-types';
import { and, eq, getTableColumns, getTableName } from 'drizzle-orm';
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core';
import { CORE_SKILL_RENAMED, type SkillRenamedEventPayload } from './events.ts';

function requiredColumn(table: PgTable, cols: Record<string, PgColumn>, key: string): PgColumn {
  const col = cols[key];
  if (!col) {
    throw new Error(
      `makeSkillRenamedSubscriber: table "${getTableName(table)}" is missing required column "${key}"`,
    );
  }
  return col;
}

export function makeSkillRenamedSubscriber(opts: {
  subscription: string;
  tables: PgTable[];
}): SubscriberDef {
  return {
    subscription: opts.subscription,
    event: CORE_SKILL_RENAMED,
    eventVersion: 1,
    handler: async (event, ctx) => {
      const e = event as DomainEvent<SkillRenamedEventPayload>;
      const { skill_id, name } = e.payload;

      for (const table of opts.tables) {
        const cols = getTableColumns(table);
        const tenantIdCol = requiredColumn(table, cols, 'tenant_id');
        const skillIdCol = requiredColumn(table, cols, 'skill_id');
        requiredColumn(table, cols, 'skill_name');
        requiredColumn(table, cols, 'updated_at');

        await ctx.tx
          .update(table)
          .set({ skill_name: name, updated_at: new Date() })
          .where(and(eq(tenantIdCol, e.tenantId), eq(skillIdCol, skill_id)));
      }
    },
  };
}
