import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Command,
  CommandEmpty,
  CommandItem,
  CommandList,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@seta/shared-ui';
import { useEffect, useState } from 'react';
import { type ProfileDto, patchProfile, searchSkillsApi } from '../api/client.ts';

export function ProfileSkillsSection({
  profile,
  onUpdate,
}: {
  profile: ProfileDto;
  onUpdate: (p: ProfileDto) => void;
}) {
  const [skills, setSkills] = useState<string[]>([...profile.skills]);
  const [open, setOpen] = useState(false);
  const [prefix, setPrefix] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      if (prefix.length === 0) {
        if (!cancelled) setSuggestions([]);
        return;
      }
      const results = await searchSkillsApi(prefix);
      if (!cancelled) setSuggestions(results.filter((s) => !skills.includes(s)));
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [prefix, skills]);

  function addSkill(s: string) {
    const clean = s.toLowerCase().trim();
    if (!clean || skills.includes(clean)) return;
    setSkills([...skills, clean]);
    setPrefix('');
  }

  function removeSkill(s: string) {
    setSkills(skills.filter((x) => x !== s));
  }

  async function save() {
    setSaving(true);
    try {
      const updated = await patchProfile({ skills });
      onUpdate(updated);
      setSkills([...updated.skills]);
    } finally {
      setSaving(false);
    }
  }

  const dirty = JSON.stringify([...skills].sort()) !== JSON.stringify([...profile.skills].sort());

  return (
    <Card>
      <CardHeader>
        <CardTitle>Skills</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {skills.map((s) => (
            <Badge key={s} variant="secondary" className="gap-1">
              {s}
              <button type="button" onClick={() => removeSkill(s)} aria-label={`Remove ${s}`}>
                ×
              </button>
            </Badge>
          ))}
        </div>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Input
              placeholder="Add a skill"
              value={prefix}
              onChange={(e) => {
                setPrefix(e.target.value);
                setOpen(true);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addSkill(prefix);
                  setOpen(false);
                }
              }}
            />
          </PopoverTrigger>
          <PopoverContent className="p-0 w-[var(--radix-popover-trigger-width)]">
            <Command>
              <CommandList>
                <CommandEmpty>Press Enter to add &ldquo;{prefix}&rdquo;</CommandEmpty>
                {suggestions.map((s) => (
                  <CommandItem
                    key={s}
                    onSelect={() => {
                      addSkill(s);
                      setOpen(false);
                    }}
                  >
                    {s}
                  </CommandItem>
                ))}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        <Button onClick={save} disabled={saving || !dirty}>
          Save
        </Button>
      </CardContent>
    </Card>
  );
}
