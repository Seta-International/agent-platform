import { createHttpEntitySource } from '@seta/shared-ui';

/**
 * web-agent's own declaration of the people search endpoint.
 *
 * Deliberately NOT imported from `@seta/web-people`: web-agent is cross-module
 * infra (its side panel embeds in every app), so depending on a leaf app
 * package would invert the tier graph and drag web-people into every consumer.
 * `web-admin/src/api/org-unit-search.ts` and `web-pm/src/api/org-unit-search.ts`
 * are the same pattern — the shared `createHttpEntitySource` infra is the reuse.
 * Note `.dependency-cruiser.cjs` exempts web-agent in its `from` clause, so this
 * boundary is architectural, not automated.
 */
interface WorkerRow {
  worker_id: string;
  full_name: string;
}

export const peopleSearch = createHttpEntitySource<WorkerRow>({
  path: '/api/people/v1/workers',
  extract: (j) => (j as { rows: WorkerRow[] }).rows,
  mapRow: (w) => ({ id: w.worker_id, label: w.full_name }),
});
