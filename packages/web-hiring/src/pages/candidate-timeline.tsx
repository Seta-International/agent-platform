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

const KIND_LABEL: Record<string, string> = {
  created: 'Candidate created',
  stage_changed: 'Stage changed',
  hired: 'Hired',
  rejected: 'Rejected',
  transferred: 'Transferred to another role',
  cancelled: 'Application closed',
  rating_changed: 'Rating updated',
  note_changed: 'Note updated',
  skills_changed: 'Skills updated',
  profile_changed: 'Profile updated',
};

const KIND_ICON: Record<string, LucideIcon> = {
  created: Users,
  stage_changed: Ticket,
  hired: BadgeCheck,
  rejected: Ticket,
  transferred: Ticket,
  cancelled: Ban,
  rating_changed: Star,
  note_changed: Pencil,
  skills_changed: Pencil,
  profile_changed: FileText,
};

function fmt(ts: string): string {
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? ts : d.toLocaleString();
}

// candidate_event stores only actor_user_id — a null one is a system-triggered event; a real
// user id is resolved to a display name via the identity directory (`actorNames`, wired by the
// caller). Falls back to "Unknown" only when the directory can't resolve the id.
function actorLabel(actorUserId: string | null, actorNames?: Record<string, string>): string {
  if (actorUserId === null) return 'System';
  return actorNames?.[actorUserId] ?? 'Unknown';
}

// Event summaries store the raw requisition_id (e.g. "…applying for requisition <uuid>"), the same
// way they store actor_user_id — the human-facing name is resolved at display time. Swap any
// requisition UUID in the summary for its title; leave unknown ids untouched.
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
function resolveSummary(summary: string, requisitionNames?: Record<string, string>): string {
  if (!requisitionNames) return summary;
  return summary.replace(UUID_RE, (id) => requisitionNames[id] ?? id);
}

export function CandidateTimeline({
  events,
  loading,
  actorNames,
  requisitionNames,
}: {
  events: CandidateEvent[];
  loading?: boolean;
  /** actor_user_id → display name, resolved against the identity directory by the caller. */
  actorNames?: Record<string, string>;
  /** requisition_id → title, so summaries show the role name instead of a raw id. */
  requisitionNames?: Record<string, string>;
}) {
  if (loading) {
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-10 animate-pulse rounded border border-border bg-surface" />
        ))}
      </div>
    );
  }
  if (events.length === 0) {
    return <div className="text-sm text-secondary">No activity yet.</div>;
  }
  return (
    <ol className="space-y-3">
      {events.map((e) => {
        const Icon = KIND_ICON[e.kind] ?? CircleUserRound;
        const summary = resolveSummary(e.summary, requisitionNames);
        return (
          <li key={e.id} className="flex items-start gap-2.5">
            <span className="mt-0.5 flex size-6 flex-none items-center justify-center rounded-full bg-accent-muted text-accent">
              <Icon className="size-3.5" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-base font-medium text-primary">
                {KIND_LABEL[e.kind] ?? e.kind}
              </div>
              {summary && KIND_LABEL[e.kind] && summary !== KIND_LABEL[e.kind] && (
                <div className="text-sm text-secondary">{summary}</div>
              )}
              <div className="text-sm text-secondary">
                by {actorLabel(e.actor_user_id, actorNames)} · {fmt(e.created_at)}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
