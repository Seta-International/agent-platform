import {
  Button,
  Card,
  type SearchableItem,
  type SearchSource,
  SkillLevelRating,
  Typeahead,
  toast,
} from '@seta/shared-ui';
import { X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  type ProfileDto,
  type ProfileSkill,
  type SaveProfile,
  searchSkillsApi,
  setMySkillLevelApi,
} from '../api/client.ts';

// A staged skill: id is null until the row has been persisted (a locally-added
// skill has no id yet). Names are unique within the list, so name is the key.
type DraftSkill = { id: string | null; name: string; level: number | null };

// Order-independent signature of a skill set (name + level) for dirty-checking.
function signature(list: readonly { name: string; level: number | null }[]): string {
  return list
    .map((s) => `${s.name.toLowerCase()}:${s.level ?? ''}`)
    .sort()
    .join('|');
}

export function ProfileSkillsSection({
  profile,
  onSave,
  onUpdate,
}: {
  profile: ProfileDto;
  onSave: SaveProfile;
  onUpdate: (p: ProfileDto) => void;
}) {
  const [draft, setDraft] = useState<DraftSkill[]>(() => profile.skills.map((s) => ({ ...s })));
  const [saving, setSaving] = useState(false);

  const serverSig = signature(profile.skills);

  // Resync the draft whenever the persisted skill set actually changes (after our
  // own Save, or an external update). Keyed on the signature so edits on sibling
  // profile tabs — which don't touch skills — never clobber in-progress edits.
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally keyed on serverSig, not the profile.skills reference
  useEffect(() => {
    setDraft(profile.skills.map((s) => ({ ...s })));
  }, [serverSig]);

  const draftNames = draft.map((s) => s.name);

  // The Typeahead only ever emits a catalog item from this source, so a
  // non-catalog free-text value can never be added (PUT /me/skills 400s on
  // non-catalog names) — the old exact/top-match commit logic is unnecessary.
  const source: SearchSource<SearchableItem> = useMemo(
    () => ({
      async search(query) {
        const q = query.trim();
        if (q.length === 0) return [];
        const results = await searchSkillsApi(q);
        const have = new Set(draft.map((d) => d.name.toLowerCase()));
        return results.filter((s) => !have.has(s.toLowerCase())).map((s) => ({ id: s, label: s }));
      },
      bootstrap() {
        return [];
      },
    }),
    [draft],
  );

  function addSkill(name: string) {
    const canonical = name.trim();
    if (!canonical || draft.some((d) => d.name.toLowerCase() === canonical.toLowerCase())) return;
    setDraft((prev) => [...prev, { id: null, name: canonical, level: null }]);
  }

  function removeSkill(name: string) {
    setDraft((prev) => prev.filter((s) => s.name !== name));
  }

  function rate(name: string, level: number | null) {
    setDraft((prev) => prev.map((s) => (s.name === name ? { ...s, level } : s)));
  }

  async function save() {
    setSaving(true);
    try {
      // 1. Persist membership by name (adds new rows, removes dropped ones).
      const afterMembership = await onSave({ skills: draftNames });
      // 2. Persist any changed levels — new rows now have server ids.
      const byName = new Map(afterMembership.skills.map((s) => [s.name.toLowerCase(), s]));
      const levelCalls: Promise<void>[] = [];
      for (const d of draft) {
        const server = byName.get(d.name.toLowerCase());
        if (server && server.level !== d.level)
          levelCalls.push(setMySkillLevelApi(server.id, d.level));
      }
      await Promise.all(levelCalls);
      // 3. Reflect the just-saved levels (we know the targets) without a refetch.
      const finalSkills: ProfileSkill[] = afterMembership.skills.map((s) => {
        const d = draft.find((x) => x.name.toLowerCase() === s.name.toLowerCase());
        return d ? { ...s, level: d.level } : s;
      });
      onUpdate({ ...afterMembership, skills: finalSkills });
      toast.success('Skills saved');
    } catch {
      toast.error('Could not save skills');
    } finally {
      setSaving(false);
    }
  }

  const shown = [...draft].sort((a, b) => a.name.localeCompare(b.name));
  const dirty = signature(draft) !== serverSig;

  return (
    <Card className="space-y-4 pt-6">
      <Typeahead
        label="Search to add a skill"
        isLabelHidden
        placeholder="Search to add a skill…"
        searchSource={source}
        value={null}
        onChange={(item) => {
          if (item) addSkill(item.label);
        }}
        debounceMs={200}
        isDisabled={saving}
      />

      {shown.length === 0 ? (
        <p className="text-body-sm text-ink-muted">No skills yet — search above to add one.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {shown.map((s) => (
            <div
              key={s.name}
              className="group flex flex-col gap-2 rounded-md border border-hairline bg-surface-2 px-3 py-2.5 transition-colors hover:bg-surface-3"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-body-sm font-medium text-ink truncate">{s.name}</span>
                <button
                  type="button"
                  aria-label={`Remove ${s.name}`}
                  disabled={saving}
                  className="shrink-0 rounded text-ink-subtle opacity-0 transition-opacity hover:text-ink group-hover:opacity-100 focus-visible:opacity-100"
                  onClick={() => removeSkill(s.name)}
                >
                  <X className="size-3.5" />
                </button>
              </div>
              <SkillLevelRating level={s.level} onChange={(level) => rate(s.name, level)} />
            </div>
          ))}
        </div>
      )}

      {shown.length > 0 && (
        <p className="text-caption text-ink-subtle">
          Click a segment to rate proficiency · 1 = novice, 5 = expert · click the active level to
          clear
        </p>
      )}

      <div className="flex justify-end pt-1">
        <Button
          onClick={save}
          isDisabled={saving || !dirty}
          label={saving ? 'Saving…' : 'Save changes'}
        />
      </div>
    </Card>
  );
}
