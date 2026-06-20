import {
  Badge,
  Button,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@seta/shared-ui';
import { useQuery } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { fetchSkillCatalog } from '../api/hiring-client.ts';
import { hiringKeys } from '../state/query-keys.ts';

export interface PickedSkill {
  skill_id: string;
  skill_name: string;
  level?: number;
}

export function SkillPicker({
  value,
  onChange,
}: {
  value: PickedSkill[];
  onChange: (next: PickedSkill[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const { data } = useQuery({ queryKey: hiringKeys.skillCatalog(), queryFn: fetchSkillCatalog });
  const categories = data?.categories ?? [];
  const skills = useMemo(() => (data?.skills ?? []).filter((s) => s.active), [data]);
  const chosen = new Set(value.map((v) => v.skill_id));

  function add(skillId: string, name: string) {
    if (chosen.has(skillId)) return;
    onChange([...value, { skill_id: skillId, skill_name: name }]);
  }
  function remove(skillId: string) {
    onChange(value.filter((v) => v.skill_id !== skillId));
  }
  function setLevel(skillId: string, level: number) {
    onChange(value.map((v) => (v.skill_id === skillId ? { ...v, level } : v)));
  }

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button type="button" variant="secondary" size="sm">
            Add skill
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-0">
          <Command>
            <CommandInput placeholder="Search skills…" />
            <CommandList>
              <CommandEmpty>No skills in catalog.</CommandEmpty>
              {categories.map((cat) => {
                const inCat = skills.filter((s) => s.category_id === cat.id);
                if (inCat.length === 0) return null;
                return (
                  <CommandGroup key={cat.id} heading={cat.name}>
                    {inCat.map((s) => (
                      <CommandItem
                        key={s.id}
                        value={`${cat.name} ${s.name}`}
                        onSelect={() => add(s.id, s.name)}
                      >
                        {s.name}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                );
              })}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      <div className="flex flex-wrap gap-2">
        {value.map((v) => (
          <Badge key={v.skill_id} variant="secondary" className="gap-1 pr-1">
            {v.skill_name}
            <select
              aria-label={`${v.skill_name} level`}
              className="ml-1 bg-transparent text-eyebrow outline-none"
              value={v.level ?? ''}
              onChange={(e) => setLevel(v.skill_id, Number(e.target.value))}
            >
              <option value="">lvl</option>
              {[0, 1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            <button
              type="button"
              aria-label={`Remove ${v.skill_name}`}
              onClick={() => remove(v.skill_id)}
            >
              <X className="size-3" />
            </button>
          </Badge>
        ))}
      </div>
    </div>
  );
}
