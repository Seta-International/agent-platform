import {
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

// candidate_event.actor_user_id has no local name projection in the hiring module (would need
// a cross-module identity lookup) — null reliably means a system-triggered event, but a real
// user id can't be resolved to a display name here, so it's labeled honestly instead of guessed.
function actorLabel(actorUserId: string | null): string {
  return actorUserId === null ? 'System' : 'No Data';
}

export function CandidateTimeline({
  events,
  loading,
}: {
  events: CandidateEvent[];
  loading?: boolean;
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
    return <div className="text-caption text-secondary">No activity yet.</div>;
  }
  return (
    <ol className="space-y-3">
      {events.map((e) => {
        const Icon = KIND_ICON[e.kind] ?? CircleUserRound;
        return (
          <li key={e.id} className="flex items-start gap-2.5">
            <span className="mt-0.5 flex size-6 flex-none items-center justify-center rounded-full bg-accent-muted text-accent">
              <Icon className="size-3.5" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-body-sm font-medium text-primary">
                {KIND_LABEL[e.kind] ?? e.kind}
              </div>
              {e.summary && KIND_LABEL[e.kind] && e.summary !== KIND_LABEL[e.kind] && (
                <div className="text-caption text-secondary">{e.summary}</div>
              )}
              <div className="text-caption text-secondary">
                by {actorLabel(e.actor_user_id)} · {fmt(e.created_at)}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
