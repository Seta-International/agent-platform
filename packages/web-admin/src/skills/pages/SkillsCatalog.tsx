// biome-ignore-all lint/a11y/noAutofocus: inline rename inputs take focus when opened.
import {
  Badge,
  Banner,
  Button,
  Card,
  cn,
  EmptyState,
  Heading,
  HStack,
  Input,
  Layout,
  LayoutContent,
  LayoutPanel,
  PageContainer,
  Skeleton,
  StackItem,
  Text,
  useToast,
  VStack,
} from '@seta/shared-ui';
import { usePermission } from '@seta/web-identity';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, Check, Crown, Layers, Lock, Pencil, Plus, Search, Tags, X } from 'lucide-react';
import { type ReactNode, useMemo, useState } from 'react';
import { AdminPageHeader } from '../../components/AdminPageHeader.tsx';
import { RailHeader, StatBar, StatChip } from '../../components/access-console.tsx';
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
  const toast = useToast();
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
    onError: (e) => toast({ body: (e as Error).message, type: 'error' }),
  });

  const renameCatMut = useMutation({
    mutationFn: (v: { id: string; name: string; version: number }) =>
      updateCategory(v.id, { name: v.name, expected_version: v.version }),
    onSuccess: invalidateCats,
    onError: (e) => {
      toast({
        body: isConflict(e) ? 'This category changed elsewhere. Refreshing…' : (e as Error).message,
        type: 'error',
      });
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
      toast({
        body: isConflict(e) ? 'This category changed elsewhere. Refreshing…' : (e as Error).message,
        type: 'error',
      });
      invalidateCats();
    },
  });

  const addSkillMut = useMutation({
    mutationFn: () => createSkill({ category_id: activeId as string, name: newSkillName.trim() }),
    onSuccess: () => {
      setNewSkillName('');
      invalidateSkills();
    },
    onError: (e) => toast({ body: (e as Error).message, type: 'error' }),
  });

  const renameSkillMut = useMutation({
    mutationFn: (v: { id: string; name: string; version: number }) =>
      updateSkill(v.id, { name: v.name, expected_version: v.version }),
    onSuccess: invalidateSkills,
    onError: (e) => {
      toast({
        body: isConflict(e) ? 'This skill changed elsewhere. Refreshing…' : (e as Error).message,
        type: 'error',
      });
      invalidateSkills();
    },
  });

  const archiveSkillMut = useMutation({
    mutationFn: (v: { id: string; version: number }) => archiveSkill(v.id, v.version),
    onSuccess: invalidateSkills,
    onError: (e) => {
      toast({
        body: isConflict(e) ? 'This skill changed elsewhere. Refreshing…' : (e as Error).message,
        type: 'error',
      });
      invalidateSkills();
    },
  });

  const loading = categoriesQ.isLoading || skillsQ.isLoading;
  const largest = largestCategory(categories, countByCat);
  const headingText = searching ? 'Search results' : (activeCat?.name ?? 'Skills');

  return (
    <Layout
      height="fill"
      header={
        <AdminPageHeader
          crumb="Skills catalog"
          title="Skills catalog"
          subtitle="Categories and skills that can be assigned to roles and people."
        />
      }
      start={
        categoriesQ.error ? undefined : (
          <LayoutPanel hasDivider width={288} padding={0} isScrollable={false}>
            <VStack height="100%">
              <RailHeader>Categories</RailHeader>
              <StackItem size="fill" isScrollable>
                <VStack gap={2} padding={2}>
                  {loading ? (
                    <>
                      <Skeleton height={40} radius={2} />
                      <Skeleton height={40} radius={2} />
                      <Skeleton height={40} radius={2} />
                    </>
                  ) : (
                    <>
                      {canManage && (
                        <AddRow
                          placeholder="New category…"
                          value={newCatName}
                          onChange={setNewCatName}
                          onSubmit={() => addCatMut.mutate()}
                          pending={addCatMut.isPending}
                        />
                      )}

                      <VStack as="ul" gap={0.5}>
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
                            onArchive={() =>
                              archiveCatMut.mutate({ id: cat.id, version: cat.version })
                            }
                          />
                        ))}
                        {categories.length === 0 && (
                          <li>
                            <Text color="disabled" style={{ padding: 'var(--spacing-2)' }}>
                              No categories yet.
                            </Text>
                          </li>
                        )}
                      </VStack>
                    </>
                  )}
                </VStack>
              </StackItem>
            </VStack>
          </LayoutPanel>
        )
      }
      content={
        <LayoutContent padding={0}>
          {categoriesQ.error ? (
            <PageContainer>
              <Banner
                status="error"
                title={
                  <>Couldn&apos;t load the skills catalog: {(categoriesQ.error as Error).message}</>
                }
              />
            </PageContainer>
          ) : loading ? (
            <VStack gap={4} style={{ padding: 'var(--spacing-7) var(--spacing-8)' }}>
              <Skeleton className="max-w-md" height={64} radius={3} />
              <Skeleton height={384} radius={3} />
            </VStack>
          ) : (
            <VStack gap={6} style={{ padding: 'var(--spacing-7) var(--spacing-8)' }}>
              <VStack as="header" gap={3}>
                <HStack wrap="wrap" hAlign="between" vAlign="center" gap={3}>
                  <HStack gap={2} vAlign="center">
                    <Heading level={2}>{headingText}</Heading>
                    <Badge
                      variant="neutral"
                      className="tabular-nums" // keep: Badge has no numeric-alignment prop
                      label={visibleSkills.length}
                    />
                  </HStack>

                  <Input
                    label="Search skills"
                    isLabelHidden
                    startIcon={<Search className="size-3.5" aria-hidden />}
                    hasClear
                    value={search}
                    onChange={(value) => setSearch(value)}
                    placeholder="Search all skills…"
                    width={224}
                    size="sm"
                  />
                </HStack>

                <StatBar>
                  <StatChip
                    icon={<Layers className="size-4" />}
                    value={categories.length}
                    label="categories"
                  />
                  <StatChip
                    icon={<Tags className="size-4" />}
                    value={skills.length}
                    label="skills"
                  />
                  {largest && (
                    <StatChip
                      icon={<Crown className="size-4" />}
                      value={largest.count}
                      label={`in ${largest.name}`}
                    />
                  )}
                </StatBar>

                {!canManage && (
                  <HStack
                    gap={2}
                    vAlign="center"
                    style={{
                      border: '1px solid var(--color-border)',
                      borderRadius: 'var(--radius-container)',
                      backgroundColor: 'var(--color-background-surface)',
                      paddingInline: 'var(--spacing-4)',
                      // original py-2.5 (10px) has no matching spacing token; spacing-2 (8px) is
                      // the nearest step below (spacing scale jumps 2→3, no 2.5)
                      paddingBlock: 'var(--spacing-2)',
                    }}
                  >
                    <Lock
                      className="size-3.5 shrink-0"
                      aria-hidden
                      style={{ color: 'var(--color-text-secondary)' }}
                    />
                    <Text color="secondary">
                      You can view the skills catalog but not make changes.
                    </Text>
                  </HStack>
                )}
              </VStack>

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
                <Banner
                  status="error"
                  title={<>Couldn&apos;t load skills: {(skillsQ.error as Error).message}</>}
                />
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
                // Grid's `columns` prop takes a fixed count or a minWidth-based auto-fill — it
                // can't express a literal viewport-breakpoint schedule (1 col mobile / 2 sm /
                // 3 xl). A minWidth-based Grid would switch column count based on the pane's
                // actual container width instead of the browser viewport width, which is a real
                // behavior change here (the pane sits beside a fixed 288px rail, so its container
                // width tracks the viewport differently than a full-width grid would) — kept
                // native per frontend.md's "primitive can't express the shape" escape hatch.
                <ul
                  className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3" // keep: viewport-breakpoint grid — see comment above; Grid has no equivalent
                >
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
            </VStack>
          )}
        </LayoutContent>
      }
    />
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
    <HStack gap={2}>
      <StackItem size="fill">
        <Input
          label={placeholder}
          isLabelHidden
          startIcon={<Plus className="size-3.5" aria-hidden />}
          value={value}
          placeholder={placeholder}
          onChange={(v) => onChange(v)}
          onEnter={submit}
          size="sm"
        />
      </StackItem>
      <Button
        variant="secondary"
        size="sm"
        icon={<Plus className="size-3.5" />}
        label="Add"
        isDisabled={!value.trim() || pending}
        onClick={submit}
      />
    </HStack>
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
    // keep: RailItem (access-console.tsx) can't host this row — its title sits inside the
    // row's own <button>, but this row needs a nested rename Button *and* archive-confirm
    // Buttons next to the title, which a <button>-wrapped row can't hold (button-in-button
    // is invalid HTML). Padding/radius/active-tint below are copied from RailItem's outer
    // <button> so the row still reads as the same rail-item shape.
    <HStack
      as="li"
      gap={2}
      vAlign="center"
      className={cn('group relative', selected ? 'bg-surface' : 'hover:bg-surface')}
      style={{
        borderRadius: 'var(--radius-element)',
        padding: 'var(--spacing-2) var(--spacing-3)',
        transition: 'background-color 150ms ease',
      }}
    >
      {selected && (
        <span
          aria-hidden
          className="absolute left-0 w-0.5" // keep: RailItem's active accent-bar shape — no plain-token equivalent for the positioning utility
          style={{
            top: 'var(--spacing-1-5)',
            bottom: 'var(--spacing-1-5)',
            borderRadius: 'var(--radius-inner)',
            backgroundColor: 'var(--color-accent-bg)',
          }}
        />
      )}

      {/* keep: native <button> — full-width, left-aligned, truncating list row; Button centres
      its label and owns weight/size, so this shape can't be expressed via Button
      (see .claude/rules/frontend.md, which cites this exact file). */}
      <button
        type="button"
        onClick={onSelect}
        className={cn(
          'min-w-0 flex-1 truncate text-left text-base',
          selected ? 'font-semibold text-primary' : 'text-secondary',
        )}
      >
        {cat.name}
      </button>

      {/* Count pill matches RailItem's, so the rail reads the same as Groups and Role access. */}
      <HStack
        hAlign="center"
        vAlign="center"
        paddingInline={1.5}
        style={{
          height: 'var(--spacing-5)',
          minWidth: 'var(--spacing-5)',
          flex: 'none',
          borderRadius: 'var(--radius-full)',
          backgroundColor: 'var(--color-background-card)',
        }}
      >
        <Text type="supporting" color="secondary">
          {count}
        </Text>
      </HStack>

      {confirming ? (
        <HStack as="span" gap={1} vAlign="center">
          <Button
            variant="destructive"
            size="sm"
            className="h-6 px-1.5" // keep: Button has no compact-height size variant
            icon={<Check className="size-3.5" aria-hidden />}
            label="Archive"
            onClick={() => {
              setConfirming(false);
              onArchive();
            }}
          />
          <Button
            variant="ghost"
            size="sm"
            isIconOnly
            className="h-6 px-1.5 text-disabled" // keep: Button has no compact-height/muted-icon variant
            icon={<X className="size-3.5" aria-hidden />}
            label="Cancel archive"
            onClick={() => setConfirming(false)}
          />
        </HStack>
      ) : (
        canManage && (
          <HStack as="span" gap={0} vAlign="center" className="flex-none">
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
          </HStack>
        )
      )}
    </HStack>
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
      <li>
        <Card padding={1.5}>
          <InlineEditInput
            value={draft}
            onChange={setDraft}
            onCommit={commit}
            onCancel={() => setEditing(false)}
          />
        </Card>
      </li>
    );
  }

  return (
    <li>
      <Card
        padding={0}
        className="group transition-colors hover:border-border-strong" // keep: hover-border tint + group hover-reveal have no Card prop equivalent
        style={{ paddingInline: 'var(--spacing-3)', paddingBlock: 'var(--spacing-2)' }}
      >
        <HStack hAlign="between" vAlign="center" gap={2}>
          <VStack gap={0} className="min-w-0">
            <Text display="block" className="truncate">
              {skill.name}
            </Text>
            {categoryLabel && (
              <Text type="supporting" color="disabled" display="block" className="truncate">
                {categoryLabel}
              </Text>
            )}
          </VStack>

          {canManage &&
            (confirming ? (
              <HStack as="span" gap={1} vAlign="center" className="flex-none">
                <Button
                  variant="destructive"
                  size="sm"
                  className="h-6 px-1.5" // keep: Button has no compact-height size variant
                  icon={<Check className="size-3.5" aria-hidden />}
                  label="Archive"
                  onClick={() => {
                    setConfirming(false);
                    onArchive();
                  }}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  isIconOnly
                  className="h-6 px-1.5 text-disabled" // keep: Button has no compact-height/muted-icon variant
                  icon={<X className="size-3.5" aria-hidden />}
                  label="Cancel archive"
                  onClick={() => setConfirming(false)}
                />
              </HStack>
            ) : (
              <HStack
                as="span"
                gap={0}
                vAlign="center"
                className="flex-none opacity-0 transition-opacity group-hover:opacity-100" // keep: hover-reveal pseudo-class has no style/prop equivalent
              >
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
              </HStack>
            ))}
        </HStack>
      </Card>
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
      label="Name"
      isLabelHidden
      hasAutoFocus
      value={value}
      onChange={(v) => onChange(v)}
      onBlur={onCommit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onCommit();
        if (e.key === 'Escape') onCancel();
      }}
      size="sm"
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
      size="sm"
      isIconOnly
      icon={children}
      label={label}
      className="size-6 text-disabled hover:text-primary" // keep: Button has no compact icon-size + hover-color variant
      onClick={onClick}
    />
  );
}
