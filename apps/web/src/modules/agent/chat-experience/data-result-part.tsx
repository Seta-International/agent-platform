interface TaskSummary {
  taskId: string;
  title: string;
  status: string;
  labels: string[];
}
interface Recommendation {
  userId: string;
  name: string | null;
  skillMatch: string[];
  skillMatchCount: number;
  status: string;
}
interface RankedCandidate {
  userId: string;
  name: string | null;
  skills: string[];
  role: string | null;
  skillMatchCount: number;
  rank: number;
}
interface UserProfileResult {
  userId: string;
  name: string;
  role: string | null;
  skills: string[];
  availability: string;
}

interface ResultData {
  skills?: string[];
  tasks?: { task: TaskSummary; recommendations?: Recommendation[] }[];
  candidates?: RankedCandidate[];
  recommendations?: Recommendation[];
  userProfiles?: UserProfileResult[];
  message?: string;
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="my-1 rounded-md border border-hairline bg-surface-1 p-2 text-body-sm">
      {children}
    </div>
  );
}

function PersonRow({ name, id, meta }: { name: string | null; id: string; meta?: string }) {
  return (
    <li className="flex items-center justify-between gap-2 py-0.5">
      <span className="text-ink">{name ?? id}</span>
      {meta && <span className="text-caption text-ink-subtle">{meta}</span>}
    </li>
  );
}

export function DataResultPart({ data }: { data: ResultData }) {
  if (data.tasks?.length) {
    return (
      <Card>
        <ul className="flex flex-col gap-1">
          {data.tasks.map(({ task, recommendations }) => (
            <li key={task.taskId} className="flex flex-col gap-0.5">
              <span className="font-medium text-ink">{task.title}</span>
              <span className="text-caption text-ink-subtle">
                {task.status} · {task.labels.join(', ') || 'no labels'}
              </span>
              {recommendations?.length ? (
                <span className="text-caption text-ink-muted">
                  →{' '}
                  {recommendations
                    .slice(0, 3)
                    .map((r) => r.name ?? r.userId)
                    .join(', ')}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      </Card>
    );
  }
  if (data.recommendations?.length) {
    return (
      <Card>
        <ul>
          {data.recommendations.map((r) => (
            <PersonRow
              key={r.userId}
              name={r.name}
              id={r.userId}
              meta={`${r.skillMatchCount} skills · ${r.status}`}
            />
          ))}
        </ul>
      </Card>
    );
  }
  if (data.candidates?.length) {
    return (
      <Card>
        <ul>
          {data.candidates.map((c) => (
            <PersonRow
              key={c.userId}
              name={c.name}
              id={c.userId}
              meta={`${c.skillMatchCount} skills${c.role ? ` · ${c.role}` : ''}`}
            />
          ))}
        </ul>
      </Card>
    );
  }
  if (data.userProfiles?.length) {
    return (
      <Card>
        <ul className="flex flex-col gap-1">
          {data.userProfiles.map((p) => (
            <li key={p.userId} className="flex flex-col gap-0.5">
              <span className="font-medium text-ink">
                {p.name}
                {p.role ? ` · ${p.role}` : ''}
              </span>
              <span className="text-caption text-ink-subtle">
                {p.skills.join(', ') || 'no skills recorded'}
              </span>
            </li>
          ))}
        </ul>
      </Card>
    );
  }
  if (data.skills?.length) {
    return (
      <Card>
        <span className="text-caption text-ink-subtle">Skills: {data.skills.join(', ')}</span>
      </Card>
    );
  }
  // A bare `message` result is already shown as prose by the text part — render nothing.
  return null;
}
