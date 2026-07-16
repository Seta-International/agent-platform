import { useQuery } from '@tanstack/react-query';
import {
  BadgeCheck,
  Ban,
  CircleUserRound,
  FileText,
  type LucideIcon,
  Pencil,
  Star,
  Ticket,
  Users,
} from 'lucide-react';
import type { CandidateEvent } from '../api/hiring-client.ts';
import { fetchDirectoryUsersByIds } from '../api/identity-directory.ts';
import { hiringKeys } from '../state/query-keys.ts';

const KIND_LABEL: Record<string, string> = {
  created: 'Candidate created',
  stage_changed: 'Stage changed',
  hired: 'Hired',
  cancelled: 'Application closed',
  rejected: 'Rejected',
  transferred: 'Transferred to another role',
  rating_changed: 'Rating updated',
  note_changed: 'Note updated',
  skills_changed: 'Skills updated',
  profile_changed: 'Profile updated',
};

const KIND_ICON: Record<string, LucideIcon> = {
  created: Users,
  stage_changed: Ticket,
  hired: BadgeCheck,
  cancelled: Ban,
  rejected: Ticket,
  transferred: Ticket,
  rating_changed: Star,
  note_changed: Pencil,
  skills_changed: Pencil,
  profile_changed: FileText,
};

function fmt(ts: string): string {
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? ts : d.toLocaleString();
}

// candidate_event stores only actor_user_id (no name — hiring can't join identity's schema),
// so display names come from the identity directory's batch-resolve endpoint. null means a
// system-triggered event; an id the directory can't return (e.g. hard-deleted) shows a dash.
function useActorNames(events: CandidateEvent[]): Map<string, string> {
  const ids = [
    ...new Set(events.map((e) => e.actor_user_id).filter((id): id is string => !!id)),
  ].sort();
  const { data } = useQuery({
    queryKey: hiringKeys.actorNames(ids),
    queryFn: () => fetchDirectoryUsersByIds(ids),
    enabled: ids.length > 0,
    staleTime: 5 * 60_000,
  });
  return new Map((data ?? []).map((u) => [u.user_id, u.name]));
}

function actorLabel(actorUserId: string | null, names: Map<string, string>): string {
  if (actorUserId === null) return 'System';
  return names.get(actorUserId) ?? '—';
}

export function CandidateTimeline({
  events,
  loading,
}: {
  events: CandidateEvent[];
  loading?: boolean;
}) {
  const actorNames = useActorNames(events);
  if (loading) {
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-10 animate-pulse rounded border border-hairline bg-surface-2" />
        ))}
      </div>
    );
  }
  if (events.length === 0) {
    return <div className="text-caption text-ink-muted">No activity yet.</div>;
  }
  return (
    <ol className="space-y-3">
      {events.map((e) => {
        const Icon = KIND_ICON[e.kind] ?? CircleUserRound;
        return (
          <li key={e.id} className="flex items-start gap-2.5">
            <span className="mt-0.5 flex size-6 flex-none items-center justify-center rounded-full bg-primary-tint text-primary-ink">
              <Icon className="size-3.5" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-body-sm font-medium text-ink">
                {KIND_LABEL[e.kind] ?? e.kind}
              </div>
              {e.summary && KIND_LABEL[e.kind] && e.summary !== KIND_LABEL[e.kind] && (
                <div className="text-caption text-ink-muted">{e.summary}</div>
              )}
              <div className="text-caption text-ink-subtle">
                by {actorLabel(e.actor_user_id, actorNames)} · {fmt(e.created_at)}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
