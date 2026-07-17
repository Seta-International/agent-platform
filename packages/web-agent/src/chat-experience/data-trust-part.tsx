/* eslint-disable react-refresh/only-export-components -- confidenceTier is a pure helper co-located with its renderer; splitting would add a pointless module */
import { useState } from 'react';

export type Tier = 'High' | 'Medium' | 'Uncertain';

export function confidenceTier(score: number): Tier {
  if (score >= 0.7) return 'High';
  if (score >= 0.4) return 'Medium';
  return 'Uncertain';
}

const TIER_CLASS: Record<Tier, string> = {
  High: 'bg-success-muted text-success',
  Medium: 'bg-warning-muted text-warning',
  Uncertain: 'bg-surface text-secondary',
};

interface TrustData {
  confidenceScore: number;
  reasoningTrace: { step: string; detail: string; at: string }[];
  evidenceCitations: { kind: string; id: string; label?: string }[];
}

export function DataTrustPart({ data }: { data: TrustData }) {
  const [open, setOpen] = useState(false);
  const tier = confidenceTier(data.confidenceScore);
  const citations = data.evidenceCitations ?? [];
  const trace = data.reasoningTrace ?? [];
  return (
    <div className="my-1 flex flex-col gap-1 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded px-1.5 py-0.5 font-medium ${TIER_CLASS[tier]}`}>
          {tier} confidence
        </span>
        {citations.length > 0 && (
          <span className="text-secondary">
            Based on{' '}
            {citations.map((c, i) => (
              <span key={`${c.kind}-${c.id}`}>
                {i > 0 ? ', ' : ''}
                <span className="text-secondary">{c.label ?? `${c.kind}#${c.id}`}</span>
              </span>
            ))}
          </span>
        )}
        {trace.length > 0 && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="text-accent hover:underline"
          >
            Why?
          </button>
        )}
      </div>
      {open && trace.length > 0 && (
        <ul className="ml-1 flex flex-col gap-0.5 border-l border-border pl-2 text-secondary">
          {trace.map((t) => (
            <li key={`${t.step}-${t.at}`}>
              <span className="text-secondary">{t.step}</span>: {t.detail}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
