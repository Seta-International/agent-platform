import type { RpcMethodMap } from './define.ts';
import type { RpcActor } from './rbac.ts';

export type ModuleRegistry = Partial<Record<string, RpcMethodMap>>;

export interface RuntimeRegistry {
  isLocal(module: string): boolean;
  getLocalMethods(module: string): RpcMethodMap | undefined;
  getPeerUrl(module: string): string | undefined;
  getAuthHeader(): string;
  getCurrentActor(): RpcActor | null;
  getFetch(): typeof fetch | undefined;
  requireRoute(module: string): { kind: 'local' } | { kind: 'remote'; baseUrl: string };
}

export interface CreateRegistryOpts {
  loaded: ModuleRegistry;
  peerUrls: Partial<Record<string, string>>;
  authHeader: string;
  currentActor: () => RpcActor | null;
  fetch?: typeof fetch;
}

export function createRegistry(opts: CreateRegistryOpts): RuntimeRegistry {
  return {
    isLocal: (m) => Object.hasOwn(opts.loaded, m),
    getLocalMethods: (m) => opts.loaded[m],
    getPeerUrl: (m) => opts.peerUrls[m],
    getAuthHeader: () => opts.authHeader,
    getCurrentActor: opts.currentActor,
    getFetch: () => opts.fetch,
    requireRoute(m) {
      if (Object.hasOwn(opts.loaded, m)) return { kind: 'local' };
      const url = opts.peerUrls[m];
      if (url) return { kind: 'remote', baseUrl: url };
      throw new Error(
        `Module ${m} is neither loaded nor reachable (no PLATFORM_PEERS_${m.toUpperCase()})`,
      );
    },
  };
}
