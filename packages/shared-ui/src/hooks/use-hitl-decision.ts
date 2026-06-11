import { useMemo, useState } from 'react';

interface EntityItem {
  id: string;
  primary?: boolean;
}
interface EntityBlock {
  kind: 'entityList';
  select?: 'none' | 'single' | 'multi';
  items: EntityItem[];
}
interface CardLike {
  details: { kind: string }[];
}

export interface HitlDecision {
  decision: 'approve' | 'reject' | 'modify';
  overrideUserIds?: string[];
  note?: string;
}

function firstEntityBlock(card: CardLike): EntityBlock | undefined {
  return card.details.find((b): b is EntityBlock => b.kind === 'entityList');
}

/** Selection + decision state for a HITL card. Seeds from the primary entity;
 *  tracks dirty (changed from the seed) to choose approve vs modify. */
export function useHitlDecision(card: CardLike) {
  const block = firstEntityBlock(card);
  const seed = useMemo(() => block?.items.filter((i) => i.primary).map((i) => i.id) ?? [], [block]);
  const [selectedIds, setSelected] = useState<string[]>(seed);
  const multi = block?.select === 'multi';

  const toggle = (id: string) =>
    setSelected((cur) =>
      multi ? (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]) : [id],
    );

  const dirty = selectedIds.length !== seed.length || selectedIds.some((id) => !seed.includes(id));

  const toDecision = (kind: 'approve' | 'reject', note?: string): HitlDecision => {
    if (kind === 'reject') return note ? { decision: 'reject', note } : { decision: 'reject' };
    const decision = dirty ? 'modify' : 'approve';
    const base: HitlDecision = { decision, overrideUserIds: selectedIds };
    return note ? { ...base, note } : base;
  };

  return { selectedIds, toggle, dirty, reset: () => setSelected(seed), toDecision };
}
