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

const DASH = <span className="font-mono text-sm text-ink-tertiary">{'\u2014'}</span>;

export function AllocationRailCard() {
  return (
    <Card className="p-4">
      <div className="text-[11px] uppercase tracking-wider text-ink-muted mb-2">Workload</div>
      <Row label="Projects">{DASH}</Row>
      <Row label="Total allocation">{DASH}</Row>
      <Row label="Available capacity">{DASH}</Row>
      <Row label="Tasks open">{DASH}</Row>
      <Row label="Workflow runs (7d)">{DASH}</Row>
    </Card>
  );
}
