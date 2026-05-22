import { ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { PlanGroup, type PlanGroupData } from './plan-group';
import type { SectionKey, SectionTone } from './types';

export type { SectionKey, SectionTone } from './types';

export interface MyTasksSection {
  key: SectionKey;
  label: string;
  tone: SectionTone;
  count: number;
  open: boolean;
  hint?: string;
  groups: ReadonlyArray<PlanGroupData>;
}

interface Props {
  section: MyTasksSection;
}

const TONE_BG: Record<SectionTone, string> = {
  danger: 'var(--color-danger-tint)',
  warning: 'var(--color-warning-tint)',
  primary: 'var(--color-primary-tint)',
  muted: 'var(--color-surface-2)',
  success: 'var(--color-success-tint)',
};

const TONE_INK: Record<SectionTone, string> = {
  danger: 'var(--color-danger)',
  warning: 'var(--color-warning)',
  primary: 'var(--color-primary-ink)',
  muted: 'var(--color-ink-muted)',
  success: 'var(--color-success)',
};

const TONE_DOT: Record<SectionTone, string> = {
  danger: 'dot--danger',
  warning: 'dot--warning',
  primary: 'dot--primary',
  muted: 'dot--muted',
  success: 'dot--success',
};

export function MtSection({ section }: Props) {
  const [open, setOpen] = useState(section.open);

  return (
    <section data-testid="mt-section" data-section={section.key} className="mt-3.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center gap-2.5 pt-1.5 px-1 pb-2.5 border-b border-hairline bg-transparent text-left"
      >
        <ChevronDown
          size={12}
          className="text-ink-subtle transition-transform duration-150"
          style={{ transform: open ? 'none' : 'rotate(-90deg)' }}
        />
        <span data-testid="section-tone-dot" className={`dot ${TONE_DOT[section.tone]}`} />
        <span className="text-[13px] font-semibold -tracking-[0.005em]">{section.label}</span>
        <span
          data-testid="section-count"
          className="text-[11px] font-semibold px-[7px] py-px rounded-full"
          style={{ background: TONE_BG[section.tone], color: TONE_INK[section.tone] }}
        >
          {section.count}
        </span>
        {section.hint && <span className="text-[11px] text-ink-subtle">· {section.hint}</span>}
        <div className="flex-1" />
        {open && <span className="text-[11px] text-ink-subtle">Sorted by your priority</span>}
      </button>

      {open &&
        section.groups.map((g, i) => (
          <PlanGroup key={g.plan.id} sectionKey={section.key} group={g} first={i === 0} />
        ))}
    </section>
  );
}
