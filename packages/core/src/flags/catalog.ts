// packages/core/src/flags/catalog.ts
import type { FlagDef } from './types.ts';

let catalog: readonly FlagDef[] = [];

export function setFlagCatalog(defs: readonly FlagDef[]): void {
  catalog = defs;
}

export function getFlagCatalog(): readonly FlagDef[] {
  return catalog;
}

export function isKnownFlagKey(key: string): boolean {
  return catalog.some((d) => d.key === key);
}
