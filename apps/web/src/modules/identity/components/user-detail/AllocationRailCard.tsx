import { Card } from '@seta/shared-ui';
import type { ReactNode } from 'react';

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-hairline last:border-b-0 text-sm">
      <span className="text-ink-muted text-xs uppercase tracking-wider">{label}</span>
      <span>{children}</span>
    </div>
  );
}

export function AllocationRailCard() {
  const dash = <span className="font-mono text-sm text-ink-tertiary">—</span>;
  return (
    <Card className="p-4">
      <div className="text-[11px] uppercase tracking-wider text-ink-muted mb-2">
        Allocation rollup
      </div>
      <Row label="Projects">{dash}</Row>
      <Row label="Total allocation">{dash}</Row>
      <Row label="Available capacity">{dash}</Row>
      <Row label="Tasks open">{dash}</Row>
      <Row label="Workflow runs (7d)">{dash}</Row>
    </Card>
  );
}
