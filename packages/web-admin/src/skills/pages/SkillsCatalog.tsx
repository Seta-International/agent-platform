import {
  Alert,
  AlertDescription,
  Button,
  Input,
  PageChrome,
  Skeleton,
  toast,
} from '@seta/shared-ui';
import { usePermission } from '@seta/web-identity';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Lock } from 'lucide-react';
import { useState } from 'react';
import {
  archiveCategory,
  archiveSkill,
  createCategory,
  createSkill,
  listCategories,
  listSkills,
} from '../api/skills-client.ts';
import { skillKeys } from '../state/query-keys.ts';

export function SkillsCatalog() {
  const qc = useQueryClient();
  const canManage = usePermission('core.skill.manage');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newCatName, setNewCatName] = useState('');
  const [newSkillName, setNewSkillName] = useState('');

  const categoriesQ = useQuery({
    queryKey: skillKeys.categories(),
    queryFn: listCategories,
  });

  const skillsQ = useQuery({
    queryKey: skillKeys.skills(selectedId ?? undefined),
    queryFn: () => listSkills(selectedId ?? undefined),
    enabled: selectedId !== null,
  });

  const addCatMut = useMutation({
    mutationFn: () => createCategory({ name: newCatName.trim() }),
    onSuccess: () => {
      setNewCatName('');
      void qc.invalidateQueries({ queryKey: skillKeys.categories() });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const archiveCatMut = useMutation({
    mutationFn: ({ id, version }: { id: string; version: number }) => archiveCategory(id, version),
    onSuccess: (_data, { id }) => {
      if (selectedId === id) setSelectedId(null);
      void qc.invalidateQueries({ queryKey: skillKeys.categories() });
    },
    onError: (e) => {
      const msg = (e as Error).message;
      if (msg.includes('409') || msg.toLowerCase().includes('conflict')) {
        toast.error('This category was updated by someone else. Refreshing…');
      } else {
        toast.error(msg);
      }
      void qc.invalidateQueries({ queryKey: skillKeys.categories() });
    },
  });

  const addSkillMut = useMutation({
    mutationFn: () => createSkill({ category_id: selectedId as string, name: newSkillName.trim() }),
    onSuccess: () => {
      setNewSkillName('');
      void qc.invalidateQueries({ queryKey: skillKeys.skills(selectedId ?? undefined) });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const archiveSkillMut = useMutation({
    mutationFn: ({ id, version }: { id: string; version: number }) => archiveSkill(id, version),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: skillKeys.skills(selectedId ?? undefined) });
    },
    onError: (e) => {
      const msg = (e as Error).message;
      if (msg.includes('409') || msg.toLowerCase().includes('conflict')) {
        toast.error('This skill was updated by someone else. Refreshing…');
      } else {
        toast.error(msg);
      }
      void qc.invalidateQueries({ queryKey: skillKeys.skills(selectedId ?? undefined) });
    },
  });

  const selectedCategory = categoriesQ.data?.find((c) => c.id === selectedId);

  return (
    <PageChrome
      breadcrumb={['Admin']}
      title="Skills catalog"
      subtitle="Manage skill categories and skills that can be assigned to roles and people."
    >
      <div className="page-container space-y-4">
        {categoriesQ.error && (
          <Alert variant="destructive">
            <AlertDescription>
              Couldn&apos;t load skill categories: {(categoriesQ.error as Error).message}
            </AlertDescription>
          </Alert>
        )}

        {!canManage && !categoriesQ.isLoading && (
          <div className="flex items-center gap-2 rounded-lg border border-hairline bg-surface-2 px-4 py-2.5 text-body-sm text-ink-subtle">
            <Lock className="size-3.5 shrink-0" aria-hidden />
            <span>You can view the skills catalog but not make changes.</span>
          </div>
        )}

        {categoriesQ.isLoading ? (
          <Skeleton className="h-96 w-full rounded-lg" />
        ) : (
          <div className="grid grid-cols-[280px_1fr] gap-6">
            {/* Left pane: categories */}
            <section className="flex flex-col gap-3">
              <h2 className="text-body-sm font-semibold text-ink">Categories</h2>

              {canManage && (
                <div className="flex gap-2">
                  <Input
                    placeholder="New category"
                    value={newCatName}
                    onChange={(e) => setNewCatName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && newCatName.trim()) addCatMut.mutate();
                    }}
                    className="flex-1"
                  />
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={!newCatName.trim() || addCatMut.isPending}
                    onClick={() => addCatMut.mutate()}
                  >
                    Add
                  </Button>
                </div>
              )}

              <ul className="space-y-1">
                {categoriesQ.data?.map((cat) => (
                  <li
                    key={cat.id}
                    className={`group flex items-center justify-between rounded-md px-3 py-2 text-body-sm transition-colors hover:bg-surface-2 ${
                      selectedId === cat.id
                        ? 'bg-surface-2 font-semibold text-ink'
                        : 'text-ink-subtle'
                    }`}
                  >
                    <button
                      type="button"
                      className="flex-1 text-left"
                      onClick={() => setSelectedId(cat.id)}
                    >
                      {cat.name}
                    </button>
                    {canManage && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="opacity-0 group-hover:opacity-100 text-ink-tertiary transition-opacity"
                        disabled={archiveCatMut.isPending}
                        onClick={() => archiveCatMut.mutate({ id: cat.id, version: cat.version })}
                      >
                        Archive
                      </Button>
                    )}
                  </li>
                ))}
                {categoriesQ.data?.length === 0 && (
                  <li className="px-3 py-2 text-body-sm text-ink-tertiary">No categories yet.</li>
                )}
              </ul>
            </section>

            {/* Right pane: skills */}
            <section className="flex flex-col gap-3">
              <h2 className="text-body-sm font-semibold text-ink">
                {selectedCategory ? `Skills — ${selectedCategory.name}` : 'Skills'}
              </h2>

              {selectedId === null ? (
                <p className="text-body-sm text-ink-tertiary">
                  Select a category to see its skills.
                </p>
              ) : (
                <>
                  {skillsQ.error && (
                    <Alert variant="destructive">
                      <AlertDescription>
                        Couldn&apos;t load skills: {(skillsQ.error as Error).message}
                      </AlertDescription>
                    </Alert>
                  )}

                  {canManage && (
                    <div className="flex gap-2">
                      <Input
                        placeholder="New skill"
                        value={newSkillName}
                        onChange={(e) => setNewSkillName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && newSkillName.trim()) addSkillMut.mutate();
                        }}
                        className="flex-1"
                      />
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={!newSkillName.trim() || addSkillMut.isPending}
                        onClick={() => addSkillMut.mutate()}
                      >
                        Add
                      </Button>
                    </div>
                  )}

                  {skillsQ.isLoading ? (
                    <Skeleton className="h-48 w-full rounded-lg" />
                  ) : (
                    <ul className="space-y-1">
                      {skillsQ.data?.map((skill) => (
                        <li
                          key={skill.id}
                          className="group flex items-center justify-between rounded-md px-3 py-2 text-body-sm transition-colors hover:bg-surface-2"
                        >
                          <span className="text-ink">{skill.name}</span>
                          {canManage && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="opacity-0 group-hover:opacity-100 text-ink-tertiary transition-opacity"
                              disabled={archiveSkillMut.isPending}
                              onClick={() =>
                                archiveSkillMut.mutate({ id: skill.id, version: skill.version })
                              }
                            >
                              Archive
                            </Button>
                          )}
                        </li>
                      ))}
                      {skillsQ.data?.length === 0 && (
                        <li className="px-3 py-2 text-body-sm text-ink-tertiary">
                          No skills in this category yet.
                        </li>
                      )}
                    </ul>
                  )}
                </>
              )}
            </section>
          </div>
        )}
      </div>
    </PageChrome>
  );
}
