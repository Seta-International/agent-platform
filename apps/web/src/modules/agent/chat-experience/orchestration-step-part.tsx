import type { DataMessagePartComponent } from '@assistant-ui/react';
import { Badge } from '@seta/shared-ui';
import { humanizeToolName } from './leaf-tool-calls';

// Shape emitted by packages/agent/src/backend/orchestration-chat-stream.ts as a
// reconciled `data-orchestration-step` part (one per orchestration step, updated
// running→done).
interface TraceEntry {
  step?: unknown;
  detail?: unknown;
  at?: unknown;
}
interface Citation {
  kind?: unknown;
  id?: unknown;
  label?: unknown;
  score?: unknown;
}
interface TrustShape {
  reasoningTrace?: unknown;
  evidenceCitations?: unknown;
  confidenceScore?: unknown;
}
interface StepDataShape {
  stepId?: unknown;
  agentId?: unknown;
  status?: unknown;
  trust?: unknown;
}

const STEP_LABELS: Record<string, string> = {
  analyze: 'Analyze',
  match: 'Skill Match',
  avai: 'Availability',
  recommend: 'Recommend',
};

function stepLabel(stepId: unknown): string {
  if (typeof stepId !== 'string' || stepId.length === 0) return 'Step';
  return STEP_LABELS[stepId] ?? humanizeToolName(stepId);
}

// 'staffing.skillMatcher' → 'Skill Matcher'. Strip the module prefix, humanize
// the camelCase remainder.
function agentName(agentId: unknown): string {
  if (typeof agentId !== 'string' || agentId.length === 0) return '';
  const tail = agentId.includes('.') ? agentId.slice(agentId.lastIndexOf('.') + 1) : agentId;
  return humanizeToolName(tail);
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function confidenceVariant(score: number): 'success' | 'warning' | 'secondary' {
  if (score >= 0.7) return 'success';
  if (score >= 0.4) return 'warning';
  return 'secondary';
}

function citationLabel(c: Citation): string {
  const kind = typeof c.kind === 'string' ? c.kind : 'ref';
  const label = typeof c.label === 'string' && c.label.length > 0 ? c.label : undefined;
  const id = typeof c.id === 'string' ? c.id : '';
  const head = label ?? id;
  const score = typeof c.score === 'number' ? ` (${c.score.toFixed(2)})` : '';
  return `${kind}: ${head}${score}`;
}

export const OrchestrationStepPart: DataMessagePartComponent = ({ data }) => {
  const payload = (data ?? {}) as StepDataShape;
  const running = payload.status === 'running';
  const trust = (payload.trust ?? undefined) as TrustShape | undefined;
  const conf = typeof trust?.confidenceScore === 'number' ? trust.confidenceScore : undefined;
  const trace = asArray(trust?.reasoningTrace) as TraceEntry[];
  const citations = asArray(trust?.evidenceCitations) as Citation[];
  const agent = agentName(payload.agentId);

  const header = (
    <span className="inline-flex min-w-0 items-center gap-1.5 text-ink-subtle">
      {running ? (
        <span className="inline-block size-1.5 animate-pulse rounded-full bg-primary" />
      ) : (
        <span className="inline-block size-1.5 rounded-full bg-semantic-success" />
      )}
      <span className="font-medium text-ink">{stepLabel(payload.stepId)}</span>
      {agent ? <span className="truncate text-ink-tertiary">· {agent}</span> : null}
      {running ? <span className="text-ink-tertiary">…</span> : null}
    </span>
  );

  const confBadge =
    conf !== undefined ? (
      <Badge variant={confidenceVariant(conf)} className="shrink-0">
        conf {conf.toFixed(2)}
      </Badge>
    ) : null;

  // While running, or when the step produced no trust signals, show a single
  // compact row (no disclosure).
  if (running || (trace.length === 0 && citations.length === 0)) {
    return (
      <div className="my-1.5 flex items-center justify-between gap-2 rounded-md border border-hairline bg-surface-2 px-3 py-1.5 text-caption">
        {header}
        {confBadge}
      </div>
    );
  }

  return (
    <details className="group my-1.5 rounded-md border border-hairline bg-surface-2 px-3 py-1.5 text-caption">
      <summary className="flex cursor-pointer select-none items-center justify-between gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-focus">
        <span className="inline-flex min-w-0 items-center gap-1.5">
          {header}
          <span aria-hidden className="text-ink-tertiary transition-transform group-open:rotate-90">
            ›
          </span>
        </span>
        {confBadge}
      </summary>
      <div className="mt-2 space-y-2 text-ink-muted">
        {trace.length > 0 ? (
          <div>
            <div className="mb-0.5 text-eyebrow uppercase tracking-wide text-ink-tertiary">
              Reasoning
            </div>
            <ul className="space-y-0.5">
              {trace.map((t) => (
                <li
                  key={`${String(t.step)}|${String(t.detail)}|${String(t.at)}`}
                  className="flex gap-1.5"
                >
                  <span aria-hidden className="text-ink-tertiary">
                    •
                  </span>
                  <span className="min-w-0">
                    <span className="font-medium text-ink-subtle">
                      {typeof t.step === 'string' ? t.step : 'step'}
                    </span>
                    {typeof t.detail === 'string' && t.detail.length > 0 ? (
                      <span className="text-ink-muted"> — {t.detail}</span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {citations.length > 0 ? (
          <div>
            <div className="mb-0.5 text-eyebrow uppercase tracking-wide text-ink-tertiary">
              Evidence ({citations.length})
            </div>
            <ul className="space-y-0.5">
              {citations.map((c) => (
                <li key={`${String(c.kind)}|${String(c.id)}`} className="truncate text-ink-muted">
                  {citationLabel(c)}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </details>
  );
};
