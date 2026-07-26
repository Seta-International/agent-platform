import { Text } from '@seta/shared-ui';
import { Link } from '@tanstack/react-router';
import type { MonthTaskCard, MonthTaskGroup } from '../api/people-client.ts';
import type { PerformanceScopeSearch } from '../state/performance-scope.ts';

function cardLabel(card: MonthTaskCard): string {
  switch (card.kind) {
    case 'unscored':
      return `${card.unscored}/${card.total} still unscored`;
    case 'self_assessment':
      return card.submitted ? 'Self-assessment submitted' : 'Self-assessment not submitted';
    case 'morale':
      return card.submitted ? 'Morale pulse submitted' : 'Morale pulse not submitted';
    case 'cycle_locked':
      return 'Cycle locked';
  }
}

function cardAction(card: MonthTaskCard): string | null {
  switch (card.kind) {
    case 'unscored':
      return card.interactive ? 'Evaluate' : null;
    case 'self_assessment':
      return card.interactive && !card.submitted ? 'Start self-assessment' : null;
    case 'morale':
      return card.interactive && !card.submitted ? 'Open morale' : null;
    case 'cycle_locked':
      return null;
  }
}

function cardTo(card: MonthTaskCard): string | null {
  switch (card.kind) {
    case 'unscored':
      return '/people/performance/scoring';
    case 'self_assessment':
      return '/people/performance/self-assessment';
    case 'morale':
      return '/people/performance/morale';
    case 'cycle_locked':
      return null;
  }
}

function TaskCardRow({ card, search }: { card: MonthTaskCard; search: PerformanceScopeSearch }) {
  const label = cardLabel(card);
  const action = cardAction(card);
  const to = cardTo(card);
  const interactive = Boolean(action && to);

  return (
    <li
      data-testid="month-task-card"
      data-kind={card.kind}
      className="flex list-none flex-wrap items-center justify-between gap-3 rounded-md border border-hairline bg-surface px-4 py-3"
    >
      <div className="min-w-0">
        {card.kind === 'unscored' ? (
          <Text as="p" size="lg" weight="semibold" aria-label={label}>
            <span className="tabular-nums">
              {card.unscored}/{card.total}
            </span>{' '}
            <span className="text-sm font-normal text-secondary">still unscored</span>
          </Text>
        ) : (
          <Text as="p" size="sm" weight="medium" aria-label={label}>
            {label}
          </Text>
        )}
      </div>
      {interactive && to ? (
        <Link
          to={to}
          search={search}
          className="rounded-md bg-surface-secondary px-3 py-1.5 text-sm font-medium hover:bg-surface-tertiary"
          data-testid={`month-task-action-${card.kind}`}
        >
          {action}
        </Link>
      ) : null}
    </li>
  );
}

export type TasksForThisMonthProps = {
  groups: readonly MonthTaskGroup[];
  search: PerformanceScopeSearch;
  cycleStatus: string;
};

/**
 * Role-based tasks-for-this-month (FUT-695). Echoes server cards only — never
 * classifies the window or invents missing-evaluator flags on the client.
 */
export function TasksForThisMonth({ groups, search, cycleStatus }: TasksForThisMonthProps) {
  return (
    <section
      className="flex flex-col gap-4"
      data-testid="tasks-for-this-month"
      aria-label="Tasks for this month"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Text as="h2" size="sm" weight="semibold">
          This month&apos;s tasks
        </Text>
        <Text size="sm" color="secondary" data-testid="tasks-cycle-echo">
          Cycle · {cycleStatus}
        </Text>
      </div>

      {groups.length === 0 ? (
        <Text color="secondary" data-testid="tasks-empty">
          No capacity-scoped tasks for this month. Switch context or check back during the open
          window.
        </Text>
      ) : (
        <div className="flex flex-col gap-6">
          {groups.map((group) => (
            <TaskGroup key={groupKey(group)} group={group} search={search} />
          ))}
        </div>
      )}
    </section>
  );
}

function groupKey(group: MonthTaskGroup): string {
  const c = group.capacity;
  return c.kind === 'am' ? `am:${c.account_id}` : `${c.kind}:${c.project_id}`;
}

function TaskGroup({ group, search }: { group: MonthTaskGroup; search: PerformanceScopeSearch }) {
  return (
    <div className="flex flex-col gap-2" data-testid="month-task-group" data-label={group.label}>
      <Text as="h3" size="sm" weight="semibold" color="secondary">
        {group.label}
      </Text>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {group.cards.map((card) => (
          <TaskCardRow key={`${group.label}:${card.kind}`} card={card} search={search} />
        ))}
      </ul>
    </div>
  );
}
