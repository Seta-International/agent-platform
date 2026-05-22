import type { TaskWithAssigneesRow } from '@seta/planner';
import { formatRelative, PLANNER_403_LIMIT_MESSAGES } from '@seta/shared-ui';

interface PlanForCard {
  external_source?: 'native' | 'm365';
  external_id?: string | null;
  name?: string;
}

interface Props {
  task: TaskWithAssigneesRow;
  plan?: PlanForCard;
  onOpenConflictDialog?: () => void;
}

function m365PlanDeepLink(externalId: string): string {
  return `https://tasks.office.com/Home/Planner/#/plantaskboard?planId=${externalId}`;
}

export function TaskDetailExternalCard({ task, plan, onOpenConflictDialog }: Props) {
  const source = plan?.external_source ?? task.external_source ?? 'native';
  const isLinked = source === 'm365';
  const synced = task.external_synced_at ? formatRelative(task.external_synced_at) : 'never';
  const planName = plan?.name ?? '';
  const externalPlanId = plan?.external_id ?? null;
  const linkUrl = externalPlanId ? m365PlanDeepLink(externalPlanId) : null;

  const errorText =
    task.sync_status === 'error' && task.last_error
      ? (PLANNER_403_LIMIT_MESSAGES[task.last_error] ?? task.last_error)
      : null;
  const showResolveConflicts = isLinked && task.sync_status === 'conflict';

  return (
    <section className="card" aria-label="External link">
      <header className="t-sm subtle" style={{ marginBottom: 8 }}>
        External
      </header>
      <div style={listStyle}>
        <div className="t-sm">
          <span className="subtle">Source: </span>
          {isLinked ? (
            <span>
              M365
              {planName ? ` · ${planName}` : ''}
            </span>
          ) : (
            <span>Native</span>
          )}
        </div>
        <div className="t-sm">
          <span className="subtle">Synced: </span>
          <span>{synced}</span>
        </div>
        {errorText && (
          <div className="t-sm text-semantic-danger" role="status">
            {errorText}
          </div>
        )}
        {showResolveConflicts && onOpenConflictDialog && (
          <button type="button" style={actionBtn} onClick={onOpenConflictDialog}>
            Resolve conflicts
          </button>
        )}
        {isLinked && linkUrl && (
          <a href={linkUrl} target="_blank" rel="noopener noreferrer" style={anchorStyle}>
            Open in M365 Planner
          </a>
        )}
      </div>
    </section>
  );
}

const listStyle = {
  display: 'flex',
  flexDirection: 'column' as const,
  gap: 6,
  margin: 0,
};
const actionBtn = {
  alignSelf: 'flex-start',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '6px 10px',
  borderRadius: 6,
  border: '1px solid var(--color-hairline-strong)',
  background: 'transparent',
  color: 'var(--color-ink-strong)',
  fontSize: 12,
  cursor: 'pointer',
};
const anchorStyle = {
  alignSelf: 'flex-start',
  fontSize: 12,
  color: 'var(--color-accent)',
  textDecoration: 'underline',
};
