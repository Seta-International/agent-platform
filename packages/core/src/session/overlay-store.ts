import type { RoleOverlay } from '@seta/shared-rbac';

export interface OverlayStore {
  get(tenantId: string): Promise<RoleOverlay>;
  refresh(tenantId: string): Promise<void>;
}

export function createOverlayStore(deps: {
  load: (tenantId: string) => Promise<RoleOverlay>;
}): OverlayStore {
  const cache = new Map<string, RoleOverlay>();
  return {
    async get(tenantId) {
      const hit = cache.get(tenantId);
      if (hit) return hit;
      const loaded = await deps.load(tenantId);
      cache.set(tenantId, loaded);
      return loaded;
    },
    async refresh(tenantId) {
      cache.set(tenantId, await deps.load(tenantId));
    },
  };
}
