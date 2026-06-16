import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Command,
  CommandItem,
  CommandList,
  Input,
} from '@seta/shared-ui';
import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { type ProfileDto, type SaveProfile, searchSkillsApi } from '../api/client.ts';

export function ProfileSkillsSection({
  profile,
  onSave,
  onUpdate,
}: {
  profile: ProfileDto;
  onSave: SaveProfile;
  onUpdate: (p: ProfileDto) => void;
}) {
  const [skills, setSkills] = useState<string[]>([...profile.skills]);
  const [prefix, setPrefix] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      if (prefix.trim().length === 0) {
        if (!cancelled) setSuggestions([]);
        return;
      }
      try {
        const results = await searchSkillsApi(prefix);
        if (!cancelled) setSuggestions(results.filter((s) => !skills.includes(s)));
      } catch {
        if (!cancelled) setSuggestions([]);
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [prefix, skills]);

  function addSkill(s: string) {
    const clean = s.toLowerCase().trim();
    if (!clean || skills.includes(clean)) return;
    setSkills((prev) => [...prev, clean]);
    setPrefix('');
    setSuggestions([]);
  }

  function removeSkill(s: string) {
    setSkills(skills.filter((x) => x !== s));
  }

  async function save() {
    setSaving(true);
    try {
      const updated = await onSave({ skills });
      onUpdate(updated);
      setSkills([...updated.skills]);
    } finally {
      setSaving(false);
    }
  }

  const dirty = JSON.stringify(skills.toSorted()) !== JSON.stringify(profile.skills.toSorted());
  const showSuggestions = prefix.trim().length > 0 && suggestions.length > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Skills</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {skills.length === 0 && (
            <span className="text-sm text-ink-muted">No skills yet — add one below.</span>
          )}
          {skills.map((s) => (
            <Badge key={s} variant="secondary" className="gap-0.5 pr-0.5">
              <span>{s}</span>
              <Button
                size="icon"
                variant="ghost"
                aria-label={`Remove ${s}`}
                className="size-4"
                onClick={() => removeSkill(s)}
              >
                <X className="size-3" />
              </Button>
            </Badge>
          ))}
        </div>

        <div className="relative">
          <Input
            placeholder="Type a skill and press Enter"
            value={prefix}
            onChange={(e) => setPrefix(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                const top = suggestions[0];
                if (top?.startsWith(prefix.toLowerCase().trim())) addSkill(top);
                else addSkill(prefix);
              } else if (e.key === 'Backspace' && prefix === '' && skills.length > 0) {
                removeSkill(skills[skills.length - 1] as string);
              } else if (e.key === 'Escape') {
                setPrefix('');
              }
            }}
          />
          {showSuggestions && (
            <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-md border border-hairline bg-canvas shadow-md">
              <Command shouldFilter={false}>
                <CommandList className="max-h-56">
                  {suggestions.slice(0, 8).map((s) => (
                    <CommandItem key={s} value={s} onSelect={() => addSkill(s)}>
                      {s}
                    </CommandItem>
                  ))}
                </CommandList>
              </Command>
            </div>
          )}
        </div>

        <Button onClick={save} disabled={saving || !dirty}>
          Save
        </Button>
      </CardContent>
    </Card>
  );
}
