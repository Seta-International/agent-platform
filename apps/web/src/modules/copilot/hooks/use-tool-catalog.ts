import { useQuery } from '@tanstack/react-query';

export interface ToolCatalogEntry {
  id: string;
  name: string;
  description: string;
}

interface CatalogResponse {
  tools: ToolCatalogEntry[];
}

async function fetchCatalog(): Promise<CatalogResponse> {
  const res = await fetch('/api/copilot/v1/tools', { credentials: 'include' });
  if (!res.ok) throw new Error(`tools ${res.status}`);
  return (await res.json()) as CatalogResponse;
}

export function useToolCatalog() {
  const q = useQuery({
    queryKey: ['copilot', 'tools'],
    queryFn: fetchCatalog,
    staleTime: 5 * 60_000,
    gcTime: 60 * 60_000,
  });
  const tools = q.data?.tools ?? [];
  const byId = new Map(tools.map((t) => [t.id, t]));
  const nameFor = (id: string): string => byId.get(id)?.name ?? id;
  return { tools, nameFor, isLoading: q.isLoading };
}
