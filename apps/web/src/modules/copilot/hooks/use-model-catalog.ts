import { useQuery } from '@tanstack/react-query';

export type ModelTier = 'auto' | 'fast' | 'balanced' | 'reasoning';

export interface ModelOption {
  key: string;
  label: string;
  tier: ModelTier;
  supportsReasoning: boolean;
}

interface CatalogResponse {
  models: ModelOption[];
  default: string;
}

async function fetchCatalog(): Promise<CatalogResponse> {
  const res = await fetch('/api/copilot/v1/models', { credentials: 'include' });
  if (!res.ok) throw new Error(`models ${res.status}`);
  return (await res.json()) as CatalogResponse;
}

export function useModelCatalog() {
  return useQuery({
    queryKey: ['copilot', 'models'],
    queryFn: fetchCatalog,
    staleTime: 5 * 60_000,
  });
}
