import { createStaticSource, type SearchableItem, Token, Tokenizer } from '@seta/shared-ui';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useMemo, useRef } from 'react';
import { fetchSkillCatalog } from '../api/hiring-client.ts';
import { hiringKeys } from '../state/query-keys.ts';

export interface PickedSkill {
  skill_id: string;
  skill_name: string;
  // Retained on the DTO for the edit save (min_level), but FUT-559 dropped the per-skill
  // level picker — a requisition lists which skills matter, not a numeric bar per skill.
  level?: number;
}

type SkillItem = SearchableItem<{ category: string }>;

export function SkillPicker({
  value,
  onChange,
}: {
  value: PickedSkill[];
  onChange: (next: PickedSkill[]) => void;
}) {
  const { data, isPending } = useQuery({
    queryKey: hiringKeys.skillCatalog(),
    queryFn: fetchSkillCatalog,
  });
  const categories = data?.categories ?? [];
  const catName = useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories]);
  const activeSkills = useMemo(() => (data?.skills ?? []).filter((s) => s.active), [data]);

  const chosenIds = useMemo(() => new Set(value.map((v) => v.skill_id)), [value]);

  // FUT-759: auto-reopen dropdown after selection for seamless multi-select chaining.
  // setTimeout(0) fires as a macrotask — after React commits state (setResults([]))
  // and all events from the selection flush. document.activeElement at that moment
  // is the real DOM truth: if focus is still inside the field, blur+focus reopens
  // the dropdown. If the user clicked outside, activeElement is elsewhere → skip.
  // The outside click itself: if the popover is already open, browser's popover
  // light-dismiss closes it AND the click reaches the target in one gesture.
  // If the popover hasn't opened yet (bootstrap still pending), no dismiss needed.
  const fieldRef = useRef<HTMLDivElement>(null);
  const controlRef = useRef<{ focus(): void; blur(): void }>(null);

  const handleChange = useCallback(
    (next: SkillItem[], change: { type: string }) => {
      onChange(next.map((i) => ({ skill_id: i.id, skill_name: i.label })));
      if (change.type === 'add' || change.type === 'create') {
        setTimeout(() => {
          if (fieldRef.current?.contains(document.activeElement)) {
            controlRef.current?.blur();
            controlRef.current?.focus();
          }
        }, 0);
      }
    },
    [onChange],
  );

  // Dropdown source = active catalog skills NOT already picked; searchable by name + category.
  const source = useMemo(
    () =>
      createStaticSource<SkillItem>(
        activeSkills
          .filter((s) => !chosenIds.has(s.id))
          .map((s) => ({
            id: s.id,
            label: s.name,
            auxiliaryData: { category: catName.get(s.category_id) ?? '' },
          })),
        { keywords: (i) => [i.auxiliaryData?.category ?? ''] },
      ),
    [activeSkills, chosenIds, catName],
  );

  // Controlled value items derived from PickedSkill[] (single source of truth).
  const items: SkillItem[] = value.map((v) => ({
    id: v.skill_id,
    label: v.skill_name,
    auxiliaryData: { category: '' },
  }));

  return (
    <Tokenizer<SkillItem>
      label="Skills"
      isLabelHidden
      placeholder="Search skills…"
      searchSource={source}
      debounceMs={0}
      hasEntriesOnFocus
      isDisabled={isPending}
      disabledMessage="Loading skills…"
      value={items}
      handleRef={controlRef}
      onChange={handleChange}
      ref={fieldRef}
      renderToken={(item, onRemove) => (
        <Token key={item.id} label={item.label} onRemove={onRemove} />
      )}
    />
  );
}
