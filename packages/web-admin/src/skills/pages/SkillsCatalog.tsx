// biome-ignore-all lint/a11y/noAutofocus: inline rename inputs take focus when opened.
import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  cn,
  EmptyState,
  Input,
  PageChrome,
  Skeleton,
  toast,
} from '@seta/shared-ui';
import { usePermission } from '@seta/web-identity';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, Check, Layers, Lock, Pencil, Plus, Search, Tags, X } from 'lucide-react';
import { type ReactNode, useMemo, useState } from 'react';
import {
  archiveCategory,
  archiveSkill,
  createCategory,
  createSkill,
  listCategories,
  listSkills,
  type Skill,
  type SkillCategory,
  updateCategory,
  updateSkill,
} from '../api/skills-client.ts';
import { skillKeys } from '../state/query-keys.ts';

function isConflict(e: unknown): boolean {
  const msg = (e as Error).message ?? '';
  return msg.includes('409') || msg.toLowerCase().includes('conflict');
}

export function SkillsCatalog() {
  const qc = useQueryClient();
  const canManage = usePermission('core.skill.manage');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [newCatName, setNewCatName] = useState('');
  const [newSkillName, setNewSkillName] = useState('');

  const categoriesQ = useQuery({
    queryKey: skillKeys.categories(),
    queryFn: () => listCategories(),
  });
  const skillsQ = useQuery({
    queryKey: skillKeys.skills(),
    queryFn: () => listSkills({ activeOnly: true }),
  });

  const categories = useMemo(() => categoriesQ.data ?? [], [categoriesQ.data]);
  const skills = useMemo(() => skillsQ.data ?? [], [skillsQ.data]);

  const countByCat = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of skills) m.set(s.category_id, (m.get(s.category_id) ?? 0) + 1);
    return m;
  }, [skills]);

  const activeId =
    selectedId && categories.some((c) => c.id === selectedId)
      ? selectedId
      : (categories[0]?.id ?? null);
  const activeCat = categories.find((c) => c.id === activeId) ?? null;
  const catName = (id: string) => categories.find((c) => c.id === id)?.name ?? '—';

  const q = search.trim().toLowerCase();
  const searching = q.length > 0;
  const visibleSkills = searching
    ? skills.filter((s) => s.name.toLowerCase().includes(q))
    : skills.filter((s) => s.category_id === activeId);

  const invalidateCats = () => void qc.invalidateQueries({ queryKey: skillKeys.categories() });
  const invalidateSkills = () => void qc.invalidateQueries({ queryKey: skillKeys.skills() });

  const addCatMut = useMutation({
    mutationFn: () => createCategory({ name: newCatName.trim() }),
    onSuccess: (res) => {
      setNewCatName('');
      setSelectedId(res.id);
      invalidateCats();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const renameCatMut = useMutation({
    mutationFn: (v: { id: string; name: string; version: number }) =>
      updateCategory(v.id, { name: v.name, expected_version: v.version }),
    onSuccess: invalidateCats,
    onError: (e) => {
      toast.error(
        isConflict(e) ? 'This category changed elsewhere. Refreshing…' : (e as Error).message,
      );
      invalidateCats();
    },
  });

  const archiveCatMut = useMutation({
    mutationFn: (v: { id: string; version: number }) => archiveCategory(v.id, v.version),
    onSuccess: (_d, v) => {
      if (selectedId === v.id) setSelectedId(null);
      invalidateCats();
    },
    onError: (e) => {
      toast.error(
        isConflict(e) ? 'This category changed elsewhere. Refreshing…' : (e as Error).message,
      );
      invalidateCats();
    },
  });

  const addSkillMut = useMutation({
    mutationFn: () => createSkill({ category_id: activeId as string, name: newSkillName.trim() }),
    onSuccess: () => {
      setNewSkillName('');
      invalidateSkills();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const renameSkillMut = useMutation({
    mutationFn: (v: { id: string; name: string; version: number }) =>
      updateSkill(v.id, { name: v.name, expected_version: v.version }),
    onSuccess: invalidateSkills,
    onError: (e) => {
      toast.error(
        isConflict(e) ? 'This skill changed elsewhere. Refreshing…' : (e as Error).message,
      );
      invalidateSkills();
    },
  });

  const archiveSkillMut = useMutation({
    mutationFn: (v: { id: string; version: number }) => archiveSkill(v.id, v.version),
    onSuccess: invalidateSkills,
    onError: (e) => {
      toast.error(
        isConflict(e) ? 'This skill changed elsewhere. Refreshing…' : (e as Error).message,
      );
      invalidateSkills();
    },
  });

  const loading = categoriesQ.isLoading || skillsQ.isLoading;

  return (
    <PageChrome
      breadcrumb={['Admin']}
      title="Skills catalog"
      subtitle="Categories and skills that can be assigned to roles and people."
    >
      <div className="page-container space-y-5">
        {categoriesQ.error && (
          <Alert variant="destructive">
            <AlertDescription>
              Couldn&apos;t load the skills catalog: {(categoriesQ.error as Error).message}
            </AlertDescription>
          </Alert>
        )}

        {!canManage && !loading && (
          <div className="flex items-center gap-2 rounded-lg border border-hairline bg-surface-2 px-4 py-2.5 text-body-sm text-ink-subtle">
            <Lock className="size-3.5 shrink-0" aria-hidden />
            <span>You can view the skills catalog but not make changes.</span>
          </div>
        )}

        {loading ? (
          <>
            <div className="grid grid-cols-3 gap-3">
              <Skeleton height={68} radius={3} />
              <Skeleton height={68} radius={3} />
              <Skeleton height={68} radius={3} />
            </div>
            <Skeleton height={384} radius={3} />
          </>
        ) : (
          <>
            <StatStrip
              categories={categories.length}
              skills={skills.length}
              largest={largestCategory(categories, countByCat)}
            />

            <div className="grid grid-cols-[280px_1fr] gap-5">
              {/* Categories rail */}
              <section className="flex min-w-0 flex-col gap-2">
                <div className="flex items-center justify-between px-1">
                  <h2 className="flex items-center gap-1.5 text-eyebrow uppercase tracking-[0.04em] text-ink-tertiary">
                    <Layers className="size-3.5" aria-hidden />
                    Categories
                  </h2>
                  <span className="text-caption tabular-nums text-ink-tertiary">
                    {categories.length}
                  </span>
                </div>

                {canManage && (
                  <AddRow
                    placeholder="New category…"
                    value={newCatName}
                    onChange={setNewCatName}
                    onSubmit={() => addCatMut.mutate()}
                    pending={addCatMut.isPending}
                  />
                )}

                <ul className="flex flex-col gap-0.5">
                  {categories.map((cat) => (
                    <CategoryRow
                      key={cat.id}
                      cat={cat}
                      count={countByCat.get(cat.id) ?? 0}
                      selected={cat.id === activeId && !searching}
                      canManage={canManage}
                      onSelect={() => {
                        setSelectedId(cat.id);
                        setSearch('');
                      }}
                      onRename={(name) =>
                        renameCatMut.mutate({ id: cat.id, name, version: cat.version })
                      }
                      onArchive={() => archiveCatMut.mutate({ id: cat.id, version: cat.version })}
                    />
                  ))}
                  {categories.length === 0 && (
                    <li className="px-2 py-2 text-body-sm text-ink-tertiary">No categories yet.</li>
                  )}
                </ul>
              </section>

              {/* Skills pane */}
              <section className="flex min-w-0 flex-col gap-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="flex items-center gap-2 text-body-sm font-semibold text-ink">
                    {searching ? (
                      <>
                        Search results
                        <Badge variant="secondary" className="tabular-nums">
                          {visibleSkills.length}
                        </Badge>
                      </>
                    ) : activeCat ? (
                      <>
                        {activeCat.name}
                        <Badge variant="secondary" className="tabular-nums">
                          {visibleSkills.length}
                        </Badge>
                      </>
                    ) : (
                      'Skills'
                    )}
                  </h2>

                  <div className="relative w-56">
                    <Search
                      className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-2.5 size-3.5 text-ink-tertiary"
                      aria-hidden
                    />
                    <Input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search all skills…"
                      className="h-8 pl-8"
                    />
                    {searching && (
                      <button
                        type="button"
                        aria-label="Clear search"
                        onClick={() => setSearch('')}
                        className="-translate-y-1/2 absolute top-1/2 right-2 text-ink-tertiary hover:text-ink"
                      >
                        <X className="size-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {canManage && activeCat && !searching && (
                  <AddRow
                    placeholder={`Add a skill to ${activeCat.name}…`}
                    value={newSkillName}
                    onChange={setNewSkillName}
                    onSubmit={() => addSkillMut.mutate()}
                    pending={addSkillMut.isPending}
                  />
                )}

                {skillsQ.error ? (
                  <Alert variant="destructive">
                    <AlertDescription>
                      Couldn&apos;t load skills: {(skillsQ.error as Error).message}
                    </AlertDescription>
                  </Alert>
                ) : categories.length === 0 ? (
                  <EmptyState
                    icon={<Tags className="size-8" />}
                    title="No categories yet"
                    description="Create a category on the left to start building your skills catalog."
                  />
                ) : visibleSkills.length === 0 ? (
                  <EmptyState
                    icon={<Tags className="size-8" />}
                    title={searching ? 'No matching skills' : 'No skills in this category'}
                    description={
                      searching
                        ? `Nothing matches “${search.trim()}”.`
                        : canManage
                          ? 'Add the first skill using the field above.'
                          : 'This category has no skills yet.'
                    }
                  />
                ) : (
                  <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                    {visibleSkills.map((skill) => (
                      <SkillCard
                        key={skill.id}
                        skill={skill}
                        categoryLabel={searching ? catName(skill.category_id) : null}
                        canManage={canManage}
                        onRename={(name) =>
                          renameSkillMut.mutate({ id: skill.id, name, version: skill.version })
                        }
                        onArchive={() =>
                          archiveSkillMut.mutate({ id: skill.id, version: skill.version })
                        }
                      />
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </>
        )}
      </div>
    </PageChrome>
  );
}

function largestCategory(
  categories: SkillCategory[],
  countByCat: Map<string, number>,
): { name: string; count: number } | null {
  let best: { name: string; count: number } | null = null;
  for (const c of categories) {
    const n = countByCat.get(c.id) ?? 0;
    if (!best || n > best.count) best = { name: c.name, count: n };
  }
  return best && best.count > 0 ? best : null;
}

function StatStrip({
  categories,
  skills,
  largest,
}: {
  categories: number;
  skills: number;
  largest: { name: string; count: number } | null;
}) {
  return (
    <div className="grid grid-cols-3 gap-3">
      <StatTile label="Categories" value={String(categories)} />
      <StatTile label="Skills" value={String(skills)} />
      <StatTile
        label="Largest category"
        value={largest ? String(largest.count) : '—'}
        hint={largest?.name}
      />
    </div>
  );
}

function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-hairline bg-canvas px-4 py-3">
      <div className="text-caption uppercase tracking-wide text-ink-subtle">{label}</div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-2xl font-semibold tabular-nums text-ink">{value}</span>
        {hint && <span className="truncate text-caption text-ink-tertiary">{hint}</span>}
      </div>
    </div>
  );
}

function AddRow({
  placeholder,
  value,
  onChange,
  onSubmit,
  pending,
}: {
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  pending: boolean;
}) {
  const submit = () => {
    if (value.trim() && !pending) onSubmit();
  };
  return (
    <div className="flex gap-2">
      <div className="relative flex-1">
        <Plus
          className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-2.5 size-3.5 text-ink-tertiary"
          aria-hidden
        />
        <Input
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
          }}
          className="h-8 pl-8"
        />
      </div>
      <Button variant="secondary" size="sm" disabled={!value.trim() || pending} onClick={submit}>
        Add
      </Button>
    </div>
  );
}

function CategoryRow({
  cat,
  count,
  selected,
  canManage,
  onSelect,
  onRename,
  onArchive,
}: {
  cat: SkillCategory;
  count: number;
  selected: boolean;
  canManage: boolean;
  onSelect: () => void;
  onRename: (name: string) => void;
  onArchive: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(cat.name);
  const [confirming, setConfirming] = useState(false);

  if (editing) {
    const commit = () => {
      const v = draft.trim();
      setEditing(false);
      if (v && v !== cat.name) onRename(v);
    };
    return (
      <li>
        <InlineEditInput
          value={draft}
          onChange={setDraft}
          onCommit={commit}
          onCancel={() => setEditing(false)}
        />
      </li>
    );
  }

  return (
    <li
      className={cn(
        'group flex items-center gap-1 rounded-md border-l-2 py-1.5 pr-1 pl-2 transition-colors',
        selected ? 'border-primary bg-surface-2' : 'border-transparent hover:bg-surface-2',
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        className={cn(
          'min-w-0 flex-1 truncate text-left text-body-sm',
          selected ? 'font-semibold text-ink' : 'text-ink-subtle',
        )}
      >
        {cat.name}
      </button>

      {confirming ? (
        <span className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-1.5 text-destructive"
            onClick={() => {
              setConfirming(false);
              onArchive();
            }}
          >
            <Check className="size-3.5" aria-hidden /> Archive
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-1.5 text-ink-tertiary"
            onClick={() => setConfirming(false)}
          >
            <X className="size-3.5" aria-hidden />
          </Button>
        </span>
      ) : (
        <>
          <span
            className={cn(
              'min-w-[1.25rem] rounded-full px-1.5 py-0.5 text-center text-caption tabular-nums',
              selected ? 'bg-surface-3 text-ink-subtle' : 'text-ink-tertiary',
            )}
          >
            {count}
          </span>
          {canManage && (
            <span className="flex items-center opacity-0 transition-opacity group-hover:opacity-100">
              <IconBtn
                label={`Rename ${cat.name}`}
                onClick={() => {
                  setDraft(cat.name);
                  setEditing(true);
                }}
              >
                <Pencil className="size-3" aria-hidden />
              </IconBtn>
              <IconBtn label={`Archive ${cat.name}`} onClick={() => setConfirming(true)}>
                <Archive className="size-3" aria-hidden />
              </IconBtn>
            </span>
          )}
        </>
      )}
    </li>
  );
}

function SkillCard({
  skill,
  categoryLabel,
  canManage,
  onRename,
  onArchive,
}: {
  skill: Skill;
  categoryLabel: string | null;
  canManage: boolean;
  onRename: (name: string) => void;
  onArchive: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(skill.name);
  const [confirming, setConfirming] = useState(false);

  if (editing) {
    const commit = () => {
      const v = draft.trim();
      setEditing(false);
      if (v && v !== skill.name) onRename(v);
    };
    return (
      <li className="rounded-md border border-hairline bg-surface-1 p-1.5">
        <InlineEditInput
          value={draft}
          onChange={setDraft}
          onCommit={commit}
          onCancel={() => setEditing(false)}
        />
      </li>
    );
  }

  return (
    <li className="group flex items-center justify-between gap-2 rounded-md border border-hairline bg-surface-1 px-3 py-2 transition-colors hover:border-hairline-strong">
      <div className="min-w-0">
        <div className="truncate text-body-sm text-ink">{skill.name}</div>
        {categoryLabel && (
          <div className="truncate text-caption text-ink-tertiary">{categoryLabel}</div>
        )}
      </div>

      {canManage &&
        (confirming ? (
          <span className="flex flex-none items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-1.5 text-destructive"
              onClick={() => {
                setConfirming(false);
                onArchive();
              }}
            >
              <Check className="size-3.5" aria-hidden /> Archive
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-1.5 text-ink-tertiary"
              onClick={() => setConfirming(false)}
            >
              <X className="size-3.5" aria-hidden />
            </Button>
          </span>
        ) : (
          <span className="flex flex-none items-center opacity-0 transition-opacity group-hover:opacity-100">
            <IconBtn
              label={`Rename ${skill.name}`}
              onClick={() => {
                setDraft(skill.name);
                setEditing(true);
              }}
            >
              <Pencil className="size-3" aria-hidden />
            </IconBtn>
            <IconBtn label={`Archive ${skill.name}`} onClick={() => setConfirming(true)}>
              <Archive className="size-3" aria-hidden />
            </IconBtn>
          </span>
        ))}
    </li>
  );
}

function InlineEditInput({
  value,
  onChange,
  onCommit,
  onCancel,
}: {
  value: string;
  onChange: (v: string) => void;
  onCommit: () => void;
  onCancel: () => void;
}) {
  return (
    <Input
      autoFocus
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onCommit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onCommit();
        if (e.key === 'Escape') onCancel();
      }}
      className="h-8"
    />
  );
}

function IconBtn({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={label}
      className="size-6 text-ink-tertiary hover:text-ink"
      onClick={onClick}
    >
      {children}
    </Button>
  );
}
