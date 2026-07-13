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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
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
  showLevel = true,
}: {
  value: PickedSkill[];
  onChange: (next: PickedSkill[]) => void;
  /** Show the per-skill 0–5 level dropdown. Off for requisition creation, which doesn't set levels. */
  showLevel?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const { data } = useQuery({ queryKey: hiringKeys.skillCatalog(), queryFn: fetchSkillCatalog });
  const categories = data?.categories ?? [];
  const skills = useMemo(() => (data?.skills ?? []).filter((s) => s.active), [data]);
  const chosen = new Set(value.map((v) => v.skill_id));

  function add(skillId: string, name: string) {
    if (chosen.has(skillId)) return;
    onChange([...value, { skill_id: skillId, skill_name: name, level: 0 }]);
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
          <Badge
            key={v.skill_id}
            variant="neutral"
            className="h-auto gap-1.5 whitespace-nowrap py-1.5 pl-3 pr-1.5 text-body-sm"
            label={
              <>
                <span className="whitespace-nowrap">{v.skill_name}</span>
                {showLevel ? (
                  <Select
                    value={String(v.level ?? 0)}
                    onValueChange={(val) => setLevel(v.skill_id, Number(val))}
                  >
                    <SelectTrigger
                      aria-label={`${v.skill_name} level`}
                      className="ml-1 h-auto gap-1 border-0 bg-transparent p-0 text-body-sm shadow-none focus-visible:shadow-none"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[0, 1, 2, 3, 4, 5].map((n) => (
                        <SelectItem key={n} value={String(n)}>
                          {n}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : null}
                <button
                  type="button"
                  aria-label={`Remove ${v.skill_name}`}
                  onClick={() => remove(v.skill_id)}
                  className="rounded-full p-1 hover:bg-surface-2"
                >
                  <X className="size-3.5" />
                </button>
              </>
            }
          />
        ))}
      </div>
    </div>
  );
}
