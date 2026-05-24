import { eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type * as schema from '../db/schema/index.ts';
import { m365Subscriptions } from '../db/schema/index.ts';

export type M365SubscriptionRow = typeof m365Subscriptions.$inferSelect;
export type M365SubscriptionInsert = {
  tenantId: string;
  subscriptionId: string;
  resource: string;
  changeType: string;
  expirationAt: Date;
  clientStateHmac: string;
};

export interface M365SubscriptionsRepo {
  upsert(input: M365SubscriptionInsert): Promise<M365SubscriptionRow>;
  findBySubscriptionId(subscriptionId: string): Promise<M365SubscriptionRow | null>;
  findById(id: string): Promise<M365SubscriptionRow | null>;
  setExpiration(id: string, expirationAt: Date): Promise<void>;
}

export interface CreateM365SubscriptionsRepoDeps {
  db: NodePgDatabase<typeof schema>;
}

export function createM365SubscriptionsRepo(
  deps: CreateM365SubscriptionsRepoDeps,
): M365SubscriptionsRepo {
  const { db } = deps;

  return {
    async upsert(input) {
      const [row] = await db
        .insert(m365Subscriptions)
        .values({
          tenantId: input.tenantId,
          subscriptionId: input.subscriptionId,
          resource: input.resource,
          changeType: input.changeType,
          expirationAt: input.expirationAt,
          clientStateHmac: input.clientStateHmac,
        })
        .onConflictDoUpdate({
          target: [m365Subscriptions.tenantId, m365Subscriptions.resource],
          set: {
            subscriptionId: input.subscriptionId,
            changeType: input.changeType,
            expirationAt: input.expirationAt,
            clientStateHmac: input.clientStateHmac,
            updatedAt: new Date(),
          },
        })
        .returning();
      return row as M365SubscriptionRow;
    },

    async findBySubscriptionId(subscriptionId) {
      const [row] = await db
        .select()
        .from(m365Subscriptions)
        .where(eq(m365Subscriptions.subscriptionId, subscriptionId))
        .limit(1);
      return row ?? null;
    },

    async findById(id) {
      const [row] = await db
        .select()
        .from(m365Subscriptions)
        .where(eq(m365Subscriptions.id, id))
        .limit(1);
      return row ?? null;
    },

    async setExpiration(id, expirationAt) {
      await db
        .update(m365Subscriptions)
        .set({ expirationAt, updatedAt: new Date() })
        .where(eq(m365Subscriptions.id, id));
    },
  };
}
