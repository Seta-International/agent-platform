import { PageChrome, SegmentedControl } from '@seta/shared-ui';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { fetchOrgDelivery, fetchOrgStructure } from '../api/org-client.ts';
import {
  buildDeliveryGraph,
  type DeliveryDrill,
} from '../components/org-chart/build-delivery-graph.ts';
import {
  buildStructureGraph,
  type OrgGraphNodeData,
} from '../components/org-chart/build-structure-graph.ts';
import { OrgChartCanvas } from '../components/org-chart/org-chart-canvas.tsx';
import { peopleKeys } from '../state/query-keys.ts';

type Lens = 'structure' | 'delivery';

export function OrgChartPage() {
  const navigate = useNavigate();
  const [lens, setLens] = useState<Lens>('structure');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [drill, setDrill] = useState<DeliveryDrill>({ level: 'accounts' });

  const structureQ = useQuery({
    queryKey: peopleKeys.orgStructure(),
    queryFn: fetchOrgStructure,
    enabled: lens === 'structure',
  });
  const deliveryQ = useQuery({
    queryKey: peopleKeys.orgDelivery(),
    queryFn: fetchOrgDelivery,
    enabled: lens === 'delivery',
  });

  const graph = useMemo(() => {
    if (lens === 'structure') return buildStructureGraph(structureQ.data?.units ?? [], collapsed);
    return buildDeliveryGraph(deliveryQ.data?.accounts ?? [], drill);
  }, [lens, structureQ.data, deliveryQ.data, collapsed, drill]);

  const onNodeClick = (data: OrgGraphNodeData): void => {
    if (data.personId) {
      void navigate({ to: '/people/employees/$workerId', params: { workerId: data.personId } });
      return;
    }
    if (data.drillTo) {
      setDrill(data.drillTo);
      return;
    }
    if (data.unitId) {
      const key = `unit:${data.unitId}`;
      setCollapsed((prev) => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      });
    }
  };

  const isLoading = lens === 'structure' ? structureQ.isLoading : deliveryQ.isLoading;
  const isEmpty = graph.nodes.length === 0;

  return (
    <PageChrome title="Org Chart">
      <div className="flex h-[calc(100vh-9rem)] flex-col gap-3 p-4">
        <div className="flex items-center gap-3">
          <SegmentedControl
            aria-label="Org chart lens"
            value={lens}
            onValueChange={(v) => setLens(v as Lens)}
            options={[
              { value: 'structure', label: 'Org structure' },
              { value: 'delivery', label: 'Delivery' },
            ]}
          />
          {lens === 'delivery' && drill.level !== 'accounts' ? (
            <button
              type="button"
              className="text-caption text-ink-subtle hover:text-ink"
              onClick={() => setDrill({ level: 'accounts' })}
            >
              ← All accounts
            </button>
          ) : null}
        </div>
        <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-hairline">
          {isLoading ? (
            <div className="grid h-full place-items-center text-caption text-ink-subtle">
              Loading…
            </div>
          ) : isEmpty ? (
            <div className="grid h-full place-items-center text-caption text-ink-subtle">
              Nothing to show in your scope.
            </div>
          ) : (
            <OrgChartCanvas nodes={graph.nodes} edges={graph.edges} onNodeClick={onNodeClick} />
          )}
        </div>
      </div>
    </PageChrome>
  );
}
