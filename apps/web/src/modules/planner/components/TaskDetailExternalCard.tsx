import type { TaskWithAssigneesRow } from '@seta/planner';
import { formatRelative } from '@seta/shared-ui';

interface Props {
  task: TaskWithAssigneesRow;
}

export function TaskDetailExternalCard({ task }: Props) {
  const source = task.external_source ?? 'native';
  const externalId = task.external_id ?? '—';
  const etag = task.external_etag ?? '—';
  const synced = task.external_synced_at ? formatRelative(task.external_synced_at) : 'never';

  return (
    <section className="card" aria-label="External link">
      <header className="t-sm subtle" style={{ marginBottom: 8 }}>
        External
      </header>
      <dl style={dl}>
        <Row label="Source" value={source} mono />
        <Row label="External id" value={externalId} mono />
        <Row label="ETag" value={etag} mono />
        <Row label="Synced" value={synced} />
      </dl>
      <button
        type="button"
        disabled
        aria-disabled="true"
        title="Available in Spec 2"
        style={linkBtn}
      >
        Link to MS Planner task…
      </button>
    </section>
  );
}

function Row({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={row}>
      <dt className="t-xs subtle" style={{ minWidth: 84 }}>
        {label}
      </dt>
      <dd className={mono ? 'mono t-sm' : 't-sm'} style={{ margin: 0 }}>
        {value}
      </dd>
    </div>
  );
}

const dl = {
  display: 'flex',
  flexDirection: 'column' as const,
  gap: 6,
  margin: 0,
  marginBottom: 12,
};
const row = {
  display: 'flex',
  alignItems: 'baseline',
  gap: 12,
};
const linkBtn = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '6px 10px',
  borderRadius: 6,
  border: '1px dashed var(--color-hairline-strong)',
  background: 'transparent',
  color: 'var(--color-ink-subtle)',
  fontSize: 12,
  cursor: 'not-allowed',
  opacity: 0.6,
};
