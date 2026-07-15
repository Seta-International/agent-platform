import {
  createStaticSource,
  type SearchableItem,
  Selector,
  Token,
  Tokenizer,
} from '@seta/shared-ui';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { fetchSkillCatalog } from '../api/hiring-client.ts';
import { hiringKeys } from '../state/query-keys.ts';

export interface PickedSkill {
  skill_id: string;
  skill_name: string;
  level?: number;
}

type SkillItem = SearchableItem<{ level: number; category: string }>;

export function SkillPicker({
  value,
  onChange,
  showLevel = true,
}: {
  value: PickedSkill[];
  onChange: (next: PickedSkill[]) => void;
  /** Show the per-skill 0–5 level dropdown. Off for requisition creation, which doesn't set levels. */
  showLevel?: boolean;
}) {
  const { data } = useQuery({ queryKey: hiringKeys.skillCatalog(), queryFn: fetchSkillCatalog });
  const categories = data?.categories ?? [];
  const catName = useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories]);
  const activeSkills = useMemo(() => (data?.skills ?? []).filter((s) => s.active), [data]);

  const chosenIds = useMemo(() => new Set(value.map((v) => v.skill_id)), [value]);

  // Dropdown source = active catalog skills NOT already picked; searchable by name + category.
  const source = useMemo(
    () =>
      createStaticSource<SkillItem>(
        activeSkills
          .filter((s) => !chosenIds.has(s.id))
          .map((s) => ({
            id: s.id,
            label: s.name,
            auxiliaryData: { level: 0, category: catName.get(s.category_id) ?? '' },
          })),
        { keywords: (i) => [i.auxiliaryData?.category ?? ''] },
      ),
    [activeSkills, chosenIds, catName],
  );

  // Controlled value items derived from PickedSkill[] (single source of truth).
  const items: SkillItem[] = value.map((v) => ({
    id: v.skill_id,
    label: v.skill_name,
    auxiliaryData: { level: v.level ?? 0, category: '' },
  }));

  function setLevel(skillId: string, level: number) {
    onChange(value.map((v) => (v.skill_id === skillId ? { ...v, level } : v)));
  }

  return (
    <Tokenizer<SkillItem>
      label="Skills"
      isLabelHidden
      placeholder="Search skills…"
      searchSource={source}
      debounceMs={0}
      hasEntriesOnFocus
      value={items}
      onChange={(next) =>
        onChange(
          next.map((i) => ({
            skill_id: i.id,
            skill_name: i.label,
            level: i.auxiliaryData?.level ?? 0,
          })),
        )
      }
      renderToken={(item, onRemove) => (
        <Token
          key={item.id}
          label={item.label}
          onRemove={onRemove}
          endContent={
            showLevel ? (
              <Selector
                label={`${item.label} level`}
                isLabelHidden
                size="sm"
                options={[0, 1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: String(n) }))}
                value={String(item.auxiliaryData?.level ?? 0)}
                onChange={(val) => setLevel(item.id, Number(val))}
              />
            ) : undefined
          }
        />
      )}
    />
  );
}
