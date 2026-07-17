import type { TaskWithAssigneesRow } from '@seta/planner';
import {
  Avatar,
  Button,
  createStaticSource,
  HoverCard,
  IconButton,
  type SearchableItem,
  Skeleton,
  Tokenizer,
} from '@seta/shared-ui';
import { usePermission } from '@seta/web-identity';
import { Sparkles, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useAssignTask } from '../hooks/mutations/assign-task';
import { useUnassignTask } from '../hooks/mutations/unassign-task';
import { useAssigneeSuggestions } from '../hooks/queries/use-assignee-suggestions';
import { useGroupMembers } from '../hooks/queries/use-group-members';
import { PERMISSION_DENIED } from '../lib/permission-messages';
import { formatSuggestionReason, scorePercent } from './assignee-suggestion-format';
import { AI_GRADIENT, SuggestionScoreTooltip } from './suggestion-score-tooltip';

interface Props {
  task: TaskWithAssigneesRow;
  planId: string;
  groupId: string;
  isLinkedToM365?: boolean;
}

// How many AI matches the Suggested results show before deferring the rest to
// the search field.
const MAX_SUGGESTIONS = 3;

function initialsOf(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  return parts
    .slice(0, 2)
    .map((p) => p.charAt(0))
    .join('')
    .toUpperCase();
}

function hueFromUserId(userId: string): number {
  let h = 0;
  for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) >>> 0;
  return h % 360;
}

function userAvatarStyle(userId: string) {
  const hue = hueFromUserId(userId);
  return {
    background: `hsl(${hue} 60% 88%)`,
    color: `hsl(${hue} 40% 22%)`,
  };
}

// Plain-language confidence band — leads the score pill so a reader sees the
// verdict at a glance; the exact percentage stays as a secondary detail and in
// the hover breakdown.
function fitLabel(score: number): string {
  if (score >= 0.85) return 'Great';
  if (score >= 0.7) return 'Strong';
  if (score >= 0.5) return 'Good';
  return 'Fair';
}

// Assignees are managed as Tokenizer tokens; the search source and the applied
// tokens share this shape. `isDriver` marks the first assignee (the driver).
type AssigneeItem = SearchableItem<{ email?: string; isDriver?: boolean }>;

export function TaskDetailAssigneesCard({
  task,
  planId,
  groupId,
  isLinkedToM365: _isLinkedToM365 = false,
}: Props) {
  const assign = useAssignTask(planId);
  const unassign = useUnassignTask(planId);
  const canAssign = usePermission('planner.task.assign');
  const noAssignReason = PERMISSION_DENIED.task.assign;

  const membersQ = useGroupMembers(groupId);
  // Suggestions are user-initiated, not automatic: the ranking pipeline only
  // runs once the user clicks "Suggest". This keeps the feature discoverable (an
  // explicit action rather than silent background magic) and avoids running the
  // pipeline on every task open.
  const [hasTriggered, setHasTriggered] = useState(false);
  const suggestionsQ = useAssigneeSuggestions(task.id, hasTriggered && canAssign);

  const assignedIds = useMemo(
    () => new Set(task.assignees.map((a) => a.user_id)),
    [task.assignees],
  );

  // Top AI matches, shown in the Suggested results once the user asks. Capped so
  // the panel stays compact.
  const suggestions = useMemo(
    () =>
      (suggestionsQ.data ?? [])
        .filter((s) => !assignedIds.has(s.user_id))
        .slice(0, MAX_SUGGESTIONS),
    [suggestionsQ.data, assignedIds],
  );
  const shownSuggestionIds = useMemo(
    () => new Set(suggestions.map((s) => s.user_id)),
    [suggestions],
  );

  // Applied assignees, rendered as Tokenizer tokens; the first is the driver.
  const value: AssigneeItem[] = task.assignees.map((a, idx) => ({
    id: a.user_id,
    label: a.display_name,
    auxiliaryData: { email: a.email ?? undefined, isDriver: idx === 0 },
  }));

  // Tokenizer search candidates: group members not already assigned or surfaced
  // in the Suggested results below.
  const memberItems: AssigneeItem[] = useMemo(
    () =>
      (membersQ.data?.members ?? [])
        .filter((m) => !assignedIds.has(m.user_id) && !shownSuggestionIds.has(m.user_id))
        .map((m) => ({ id: m.user_id, label: m.display_name, auxiliaryData: { email: m.email } })),
    [membersQ.data, assignedIds, shownSuggestionIds],
  );
  const source = useMemo(
    () =>
      createStaticSource<AssigneeItem>(memberItems, {
        keywords: (i) => (i.auxiliaryData?.email ? [i.auxiliaryData.email] : []),
      }),
    [memberItems],
  );

  // Suggestions are user-initiated: the first click enables the query (React
  // Query fetches on enable); later clicks re-run it.
  const runSuggest = () => {
    if (hasTriggered) void suggestionsQ.refetch();
    else setHasTriggered(true);
  };

  return (
    <section className="card" aria-label="Assignees">
      <header className="mb-2 flex items-center justify-between gap-2">
        <span className="t-sm subtle">Assignees</span>
        {canAssign && (
          <Button
            size="sm"
            variant="ghost"
            label="Suggest"
            icon={<Sparkles className="size-3.5" style={{ color: '#6d5cff' }} />}
            onClick={runSuggest}
            isDisabled={suggestionsQ.isFetching}
          />
        )}
      </header>

      <Tokenizer<AssigneeItem>
        label="Assignees"
        isLabelHidden
        placeholder="Search group members…"
        searchSource={source}
        debounceMs={0}
        hasEntriesOnFocus
        isDisabled={!canAssign}
        disabledMessage={noAssignReason}
        value={value}
        onChange={(_items, change) => {
          if (change.type === 'add') {
            assign.mutate({
              task_id: task.id,
              user_id: change.item.id,
              display_name: change.item.label,
              email: change.item.auxiliaryData?.email,
            });
          } else if (change.type === 'remove') {
            unassign.mutate({ task_id: task.id, user_id: change.item.id });
          }
        }}
        renderToken={(item, onRemove) => (
          <span
            key={item.id}
            className="inline-flex items-center gap-1.5 rounded-full bg-surface py-0.5 pr-0.5 pl-1"
          >
            <Avatar name={item.label} size={20} />
            <span className="text-base text-primary">{item.label}</span>
            {item.auxiliaryData?.isDriver && <span className="text-xs subtle">driver</span>}
            <IconButton
              variant="ghost"
              size="sm"
              label={`Remove ${item.label}`}
              onClick={onRemove}
              isDisabled={!canAssign}
              icon={<X className="size-3" />}
            />
          </span>
        )}
        renderItem={(item) => (
          <div className="flex items-center gap-2.5">
            <span
              aria-hidden
              className="inline-flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
              style={userAvatarStyle(item.id)}
            >
              {initialsOf(item.label)}
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-base leading-tight text-primary">{item.label}</span>
              <span className="truncate text-sm leading-tight text-secondary">
                {item.auxiliaryData?.email}
              </span>
            </span>
          </div>
        )}
      />

      {/* AI suggestion results, below the assignees, once the user asks. */}
      {canAssign && hasTriggered && (
        <div className="mt-2">
          <span className="mb-1 inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide">
            <Sparkles className="size-3" aria-hidden style={{ color: '#6d5cff' }} />
            <span
              className="bg-clip-text text-transparent"
              style={{ backgroundImage: AI_GRADIENT }}
            >
              Suggested
            </span>
          </span>

          {suggestionsQ.isLoading ? (
            <div
              className="flex flex-col gap-2 px-1.5 py-1"
              role="status"
              aria-label="Finding matches"
            >
              {[0, 1].map((i) => (
                <div key={i} className="flex items-center gap-2.5">
                  <Skeleton height={28} width={28} radius="rounded" />
                  <div className="flex-1">
                    <Skeleton height={12} width={i === 0 ? '70%' : '55%'} />
                  </div>
                </div>
              ))}
            </div>
          ) : suggestionsQ.isError ? (
            <p className="px-1.5 py-1 text-xs text-secondary">
              Couldn't load suggestions — click Suggest to retry.
            </p>
          ) : suggestions.length > 0 ? (
            <div className="flex flex-col gap-0.5">
              {suggestions.map((s) => (
                // A full-width, left-aligned, two-line row with a trailing score
                // pill — a shape Button can't express, so it stays a native button.
                <button
                  key={s.user_id}
                  type="button"
                  title={`Assign ${s.display_name}`}
                  aria-label={`Assign ${s.display_name}`}
                  onClick={() =>
                    assign.mutate({
                      task_id: task.id,
                      user_id: s.user_id,
                      display_name: s.display_name,
                    })
                  }
                  className="group flex w-full cursor-pointer items-center gap-2.5 rounded-md border-none bg-transparent px-1.5 py-1.5 text-left transition-colors hover:bg-surface"
                >
                  <span
                    aria-hidden
                    className="inline-flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
                    style={userAvatarStyle(s.user_id)}
                  >
                    {initialsOf(s.display_name)}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-base leading-tight text-primary">
                      {s.display_name}
                    </span>
                    <span className="truncate text-sm leading-tight text-secondary">
                      {formatSuggestionReason(s)}
                    </span>
                  </span>
                  <HoverCard placement="start" content={<SuggestionScoreTooltip suggestion={s} />}>
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-accent-muted px-1.5 py-0.5 text-xs font-semibold text-accent">
                      {fitLabel(s.score)}
                      <span className="text-secondary">·</span>
                      {scorePercent(s)}%
                    </span>
                  </HoverCard>
                  {/* Reveal-on-hover affordance; opacity keeps it in flow so the
                      row doesn't reflow when it appears. */}
                  <span
                    aria-hidden
                    className="shrink-0 text-xs font-semibold text-accent opacity-0 transition-opacity group-hover:opacity-100"
                  >
                    Add
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className="rounded-md border border-dashed border-border bg-surface px-3 py-2.5">
              <p className="text-xs font-medium text-primary">No skill matches for this task yet</p>
              <p className="mt-0.5 text-xs text-secondary">
                Add a description or labels so suggestions can rank by skill.
              </p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
