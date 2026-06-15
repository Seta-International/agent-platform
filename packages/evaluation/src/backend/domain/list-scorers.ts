import { listScorerCatalogue, type ScorerDef } from '../scoring/prebuilt-registry.ts';

export type ScorerInfo = Pick<ScorerDef, 'id' | 'kind' | 'requires'>;

/** Catalogue of available prebuilt scorers, read from the code registry (not the DB). */
export function listScorers(): ScorerInfo[] {
  return listScorerCatalogue();
}
