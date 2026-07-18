import { useState } from 'react';

interface TrustData {
  confidenceScore: number;
  reasoningTrace: { step: string; detail: string; at: string }[];
  evidenceCitations: { kind: string; id: string; label?: string }[];
}

export function DataTrustPart({ data }: { data: TrustData }) {
  const [open, setOpen] = useState(false);
  const citations = data.evidenceCitations ?? [];
  const trace = data.reasoningTrace ?? [];
  // The confidence tier badge was noise; without citations or a trace there is
  // nothing left worth showing.
  if (citations.length === 0 && trace.length === 0) return null;
  return (
    <div className="my-1 flex flex-col gap-1 text-sm">
      <div className="flex flex-wrap items-center gap-2">
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
