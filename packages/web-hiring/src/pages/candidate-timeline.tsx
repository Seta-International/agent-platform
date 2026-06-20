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

function fmt(ts: string): string {
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? ts : d.toLocaleString();
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
          <div key={i} className="h-10 animate-pulse rounded border border-hairline bg-surface-2" />
        ))}
      </div>
    );
  }
  if (events.length === 0) {
    return <div className="text-ink-muted">No activity yet.</div>;
  }
  return (
    <ol className="relative space-y-3 border-l border-hairline pl-4">
      {events.map((e) => (
        <li key={e.id} className="relative">
          <span
            className="absolute -left-[21px] top-1 h-2 w-2 rounded-full bg-accent"
            aria-hidden
          />
          <div className="text-body text-ink">{KIND_LABEL[e.kind] ?? e.summary}</div>
          {e.summary && KIND_LABEL[e.kind] && e.summary !== KIND_LABEL[e.kind] && (
            <div className="text-caption text-ink-muted">{e.summary}</div>
          )}
          <div className="text-caption text-ink-muted">{fmt(e.created_at)}</div>
        </li>
      ))}
    </ol>
  );
}
