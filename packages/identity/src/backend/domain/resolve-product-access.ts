import { PRODUCT_NAMESPACES, type ProductId, productForNamespace } from '@seta/shared-rbac';
import { and, eq, inArray } from 'drizzle-orm';
import { identityDb } from '../db/index.ts';
import { productGrant } from '../db/schema.ts';
import { resolveEffectiveRoleSlugs } from './resolve-effective-roles.ts';

export async function resolveTenantProducts(tenantId: string): Promise<Set<ProductId>> {
  const rows = await identityDb()
    .select({ product_id: productGrant.product_id, effect: productGrant.effect })
    .from(productGrant)
    .where(and(eq(productGrant.subject_type, 'tenant'), eq(productGrant.subject_id, tenantId)));
  const set = new Set<ProductId>();
  for (const r of rows) {
    const id = productForNamespace(r.product_id);
    if (!id) continue;
    if (r.effect === 'grant') set.add(id);
    else set.delete(id);
  }
  return set;
}

export async function resolveProductAccess(
  userId: string,
  tenantId: string,
  groupIds: readonly string[],
): Promise<Set<string>> {
  const tenantProducts = await resolveTenantProducts(tenantId);
  if (tenantProducts.size === 0) return new Set();

  const roles = await resolveEffectiveRoleSlugs(userId, tenantId);
  const derived = new Set<string>();
  for (const r of roles) {
    const ns = r.split('.')[0];
    if (ns && PRODUCT_NAMESPACES.has(ns)) derived.add(ns);
  }

  const subjectIds = [userId, ...groupIds];
  const grants = await identityDb()
    .select({
      subject_type: productGrant.subject_type,
      product_id: productGrant.product_id,
      effect: productGrant.effect,
    })
    .from(productGrant)
    .where(and(eq(productGrant.tenant_id, tenantId), inArray(productGrant.subject_id, subjectIds)));

  const revoked = new Set<string>();
  for (const g of grants) {
    if (g.subject_type === 'tenant') continue;
    if (g.effect === 'grant') derived.add(g.product_id);
    else revoked.add(g.product_id);
  }
  for (const p of revoked) derived.delete(p);

  // gate by tenant enablement
  return new Set([...derived].filter((p) => tenantProducts.has(p as ProductId)));
}
