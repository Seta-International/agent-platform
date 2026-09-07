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
interface BranchLike {
  argsPatch?: { assigneeUserIds?: string[] };
}
interface CardLike {
  details: { kind: string }[];
  primary?: BranchLike;
  alternates?: BranchLike[];
}

/** WHICH server-authored branch the user picked. The client never supplies a
 *  value — that is FUT-804 AC5 held by the shape of this type. */
export type HitlBranch = { chosen: 'primary' } | { chosen: 'alternate'; alternateIndex: number };

function firstEntityBlock(card: CardLike): EntityBlock | undefined {
  return card.details.find((b): b is EntityBlock => b.kind === 'entityList');
}

/** The one user a branch assigns, or undefined for a branch that assigns nobody
 *  (create, update, link, merge — every non-assignment card). */
function branchUserId(branch: BranchLike | undefined): string | undefined {
  return branch?.argsPatch?.assigneeUserIds?.[0];
}

/**
 * Selection + branch state for a HITL card. Seeds from the primary entity.
 *
 * `branch` is DERIVED from the selection rather than stored beside it: the
 * selection already drives the radio rendering, and a second copy of the same
 * decision desyncs the first time anything updates one without the other.
 *
 * The mapping is by IDENTITY — the branch whose `assigneeUserIds[0]` equals the
 * selected row id. `details.items` is display order and may be re-sorted, while
 * `alternateIndex` addresses the persisted `alternates` array; mapping by
 * position would confirm the wrong person with nothing downstream able to tell.
 */
export function useHitlDecision(card: CardLike) {
  const block = firstEntityBlock(card);
  const seed = useMemo(() => block?.items.filter((i) => i.primary).map((i) => i.id) ?? [], [block]);
  const [selectedIds, setSelected] = useState<string[]>(seed);
  const multi = block?.select === 'multi';

  const toggle = (id: string) =>
    setSelected((cur) =>
      multi ? (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]) : [id],
    );

  const branch = useMemo<HitlBranch | null>(() => {
    // No rows to pick from: the primary button IS the primary branch, and any
    // alternates render as their own buttons carrying their own index.
    if (!block) return { chosen: 'primary' };
    const id = selectedIds[0];
    if (id === undefined) return null;
    if (branchUserId(card.primary) === id) return { chosen: 'primary' };
    const i = (card.alternates ?? []).findIndex((a) => branchUserId(a) === id);
    // Not a silent primary: a row matching no branch yields null, and the caller
    // disables Confirm.
    return i >= 0 ? { chosen: 'alternate', alternateIndex: i } : null;
  }, [block, card.primary, card.alternates, selectedIds]);

  return { selectedIds, toggle, branch, reset: () => setSelected(seed) };
}
