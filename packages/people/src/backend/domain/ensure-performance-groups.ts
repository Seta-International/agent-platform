import { eq } from 'drizzle-orm';
import { peopleDb } from '../db/client.ts';
import { performanceEvaluationGroup } from '../db/schema.ts';
import { PERFORMANCE_GROUP_TEMPLATES } from './performance-config-template.ts';

type DbLike = Pick<ReturnType<typeof peopleDb>, 'insert'>;

/** Idempotent: insert fixed evaluation groups for a tenant from the template. */
export async function ensurePerformanceGroups(db: DbLike, tenantId: string): Promise<void> {
  await db
    .insert(performanceEvaluationGroup)
    .values(
      PERFORMANCE_GROUP_TEMPLATES.map((g) => ({
        tenant_id: tenantId,
        code: g.code,
        name: g.name,
        sort: g.sort,
      })),
    )
    .onConflictDoNothing({
      target: [performanceEvaluationGroup.tenant_id, performanceEvaluationGroup.code],
    });
}

export async function listPerformanceGroups(tenantId: string) {
  const db = peopleDb();
  await ensurePerformanceGroups(db, tenantId);
  return db
    .select()
    .from(performanceEvaluationGroup)
    .where(eq(performanceEvaluationGroup.tenant_id, tenantId))
    .orderBy(performanceEvaluationGroup.sort);
}
