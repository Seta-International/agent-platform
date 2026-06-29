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
      <header className="t-sm subtle mb-2">External</header>
      <div className="m-0 flex flex-col gap-1.5">
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
          <button
            type="button"
            className="inline-flex cursor-pointer items-center gap-1.5 self-start rounded-md border border-hairline-strong bg-transparent px-2.5 py-1.5 text-caption text-[var(--color-ink-strong)]"
            onClick={onOpenConflictDialog}
          >
            Resolve conflicts
          </button>
        )}
        {isLinked && linkUrl && (
          <a
            href={linkUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="self-start text-caption text-[var(--color-accent)] underline"
          >
            Open in M365 Planner
          </a>
        )}
      </div>
    </section>
  );
}
