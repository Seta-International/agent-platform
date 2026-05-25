/**
 * A single result returned by a Retriever. The score is normalized 0..1 within
 * one query's results — for vector retrieval this is `1 - cosine_distance` from
 * Mastra's PgVector.
 */
export interface RetrievalHit<TItem> {
  item: TItem;
  score: number;
  rank: number;
  source: 'vector';
}

/**
 * Context every Retriever call needs — tenant isolation + RBAC actor.
 * Scope is optional; absence means caller's accessible group_ids.
 */
export interface RetrievalCtx {
  tenant_id: string;
  actor: { userId: string; tenantId: string };
  scope?: { group_ids?: bigint[] } | { tenant: true };
}

/**
 * All retrievers conform to this shape. TQuery is the per-tool input
 * (e.g. { query: string; limit?: number }); TItem is the returned entity.
 */
export interface Retriever<TQuery, TItem> {
  query(input: TQuery, ctx: RetrievalCtx): Promise<RetrievalHit<TItem>[]>;
}
