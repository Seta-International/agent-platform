/**
 * The composition root's view of the pools. Importing this is a statement that you are the
 * process entry point — `apps/server`, `apps/worker`, `apps/cli` — and are choosing a
 * privilege level directly rather than inheriting one from the ambient executor.
 *
 * Module code must never import this. It resolves connections through `executorPool()`,
 * whose privilege and tenant scope were decided here. `.dependency-cruiser.cjs` enforces it.
 */
export { getPool, getPoolStats } from './pools.ts';
