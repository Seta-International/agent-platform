import { Token } from '@seta/shared-ui';
import type { ReactNode } from 'react';

export interface ContextChipProps {
  /** What the referenced thing is — e.g. `person`, `plan.task`, `file`. Shown
   *  as a muted qualifier so it never crams into the label. */
  kind: string;
  /** Human-readable name of the referenced entity. */
  label: string;
  /** Leading glyph for the kind (caller-supplied lucide icon). */
  icon: ReactNode;
}

/**
 * One chip for every piece of context a user turn carries — page context,
 * @-mentions, and file attachments all render through this. Astryx `Token`
 * owns the pill chrome (never hand-rolled); `kind` rides as a separate muted
 * segment because `Token.label` is a single string, and cramming
 * `${kind} — ${label}` into it is exactly the bug this replaces.
 */
export function ContextChip({ kind, label, icon }: ContextChipProps) {
  return (
    <span data-context-chip data-kind={kind} className="inline-flex items-center gap-1">
      <span className="text-xs font-medium uppercase tracking-wide text-secondary">{kind}</span>
      <Token size="sm" icon={icon} label={label} />
    </span>
  );
}
