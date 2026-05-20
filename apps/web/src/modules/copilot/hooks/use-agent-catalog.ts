import { useQuery } from '@tanstack/react-query';
import { type AgentOption, FALLBACK_AGENTS } from '../components/agents';

interface CatalogResponse {
  agents: AgentOption[];
  default: string | null;
}

async function fetchCatalog(): Promise<CatalogResponse> {
  const res = await fetch('/api/copilot/v1/agents', { credentials: 'include' });
  if (!res.ok) throw new Error(`agents ${res.status}`);
  return (await res.json()) as CatalogResponse;
}

export function useAgentCatalog() {
  const q = useQuery({
    queryKey: ['copilot', 'agents'],
    queryFn: fetchCatalog,
    staleTime: 5 * 60_000,
    gcTime: 60 * 60_000,
  });
  const agents = q.data?.agents ?? FALLBACK_AGENTS;
  const defaultName = q.data?.default ?? agents[0]?.name ?? 'supervisor';
  return { agents, defaultName, isLoading: q.isLoading };
}
