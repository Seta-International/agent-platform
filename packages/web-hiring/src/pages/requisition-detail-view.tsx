import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Input,
  Label,
  RichTextDisplay,
  RichTextEditor,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
} from '@seta/shared-ui';
import { usePermission } from '@seta/web-identity';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { useState } from 'react';
import {
  editRequisition,
  fetchAccounts,
  fetchProjects,
  type JdSectionKey,
  type JdVariant,
  setRequisitionJd,
  setRequisitionSkills,
} from '../api/hiring-client.ts';
import { GRADES } from '../lib/grades.ts';
import { hiringKeys } from '../state/query-keys.ts';
import { type PickedSkill, SkillPicker } from './skill-picker.tsx';
import { on409, useRequisition } from './utils.ts';

// Skill proficiency: requisition_skill.min_level is 1–5; render a word like the design.
const LEVEL_LABEL: Record<number, string> = {
  1: 'Basic',
  2: 'Intermediate',
  3: 'Advanced',
  4: 'Expert',
  5: 'Master',
};

const SECTIONS: { key: JdSectionKey; label: string }[] = [
  { key: 'about', label: 'About the role' },
  { key: 'responsibilities', label: 'Responsibilities' },
  { key: 'requirements', label: 'Requirements' },
  { key: 'nice_to_have', label: 'Nice to have' },
];

// FUT-329: there's no variant switcher in the reference design, so this view picks
// one variant to render. `external` is the default everywhere else (new-requisition
// dialog, old jd-tab.tsx) and is where most content actually ends up, so prefer it —
// only fall back to `internal` when a requisition has internal content and no
// external content at all.
function pickJdVariant(sections: { variant: JdVariant; body: string }[]): JdVariant {
  const hasExternal = sections.some((s) => s.variant === 'external' && s.body.trim());
  const hasInternal = sections.some((s) => s.variant === 'internal' && s.body.trim());
  return hasInternal && !hasExternal ? 'internal' : 'external';
}

type SectionGrid = Record<JdSectionKey, string>;

function emptySections(): SectionGrid {
  return { about: '', responsibilities: '', requirements: '', nice_to_have: '' };
}

interface Props {
  requisitionId: string;
  variant: 'page' | 'modal';
  onClose?: () => void;
}

export function RequisitionDetailView({ requisitionId, variant, onClose }: Props) {
  const queryClient = useQueryClient();
  const canManage = usePermission('hiring.requisition.manage');
  const { data, isLoading, error } = useRequisition(requisitionId);
  const jdVariant: JdVariant = data ? pickJdVariant(data.jd_sections) : 'external';

  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState('');
  const [grade, setGrade] = useState('');
  const [accountId, setAccountId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [sections, setSections] = useState<SectionGrid>(emptySections());
  const [skills, setSkills] = useState<PickedSkill[]>([]);

  const { data: accounts } = useQuery({
    queryKey: hiringKeys.accounts(),
    queryFn: fetchAccounts,
    enabled: editing,
  });
  const { data: projects } = useQuery({
    queryKey: hiringKeys.projects(accountId || undefined),
    queryFn: () => fetchProjects(accountId || undefined),
    enabled: editing && !!accountId,
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: hiringKeys.requisition(requisitionId) });
    void queryClient.invalidateQueries({ queryKey: hiringKeys.requisitions() });
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!data) throw new Error('not loaded');
      let version = data.requisition.version;
      const fieldsChanged =
        title !== data.requisition.title ||
        grade !== (data.requisition.grade ?? '') ||
        accountId !== (data.requisition.account_id ?? '') ||
        projectId !== (data.requisition.project_id ?? '');
      if (fieldsChanged) {
        const res = await editRequisition(requisitionId, {
          expected_version: version,
          patch: {
            title,
            grade,
            account_id: accountId || undefined,
            project_id: projectId || undefined,
          },
        });
        version = res.version;
      }

      const originalSections = emptySections();
      for (const s of data.jd_sections)
        if (s.variant === jdVariant) originalSections[s.section] = s.body;
      const jdChanged = SECTIONS.some((s) => sections[s.key] !== originalSections[s.key]);
      if (jdChanged) {
        const jdRes = await setRequisitionJd(requisitionId, {
          expected_version: version,
          sections: SECTIONS.filter((s) => sections[s.key].trim()).map((s) => ({
            requisition_id: requisitionId,
            variant: jdVariant,
            section: s.key,
            body: sections[s.key],
          })),
        });
        version = jdRes.version;
      }

      const originalSkills = data.skills
        .filter((s): s is typeof s & { skill_id: string } => s.skill_id != null)
        .map((s) => ({ skill_id: s.skill_id, level: s.min_level ?? undefined }));
      const normalizeSkills = (list: { skill_id: string; level?: number }[]) =>
        [...list]
          .sort((a, b) => a.skill_id.localeCompare(b.skill_id))
          .map((s) => `${s.skill_id}:${s.level ?? ''}`)
          .join('|');
      const skillsChanged = normalizeSkills(skills) !== normalizeSkills(originalSkills);
      if (skillsChanged) {
        await setRequisitionSkills(requisitionId, {
          expected_version: version,
          skills: skills.map((s) => ({
            skill_id: s.skill_id,
            skill_name: s.skill_name,
            min_level: s.level,
          })),
        });
      }
    },
    onSuccess: () => {
      toast.success('Saved');
      setEditing(false);
      refresh();
    },
    onError: (e: Error) => on409(e, queryClient, hiringKeys.requisition(requisitionId)),
  });

  function startEditing() {
    if (!data) return;
    setTitle(data.requisition.title);
    setGrade(data.requisition.grade ?? '');
    setAccountId(data.requisition.account_id ?? '');
    setProjectId(data.requisition.project_id ?? '');
    const grid = emptySections();
    for (const s of data.jd_sections) if (s.variant === jdVariant) grid[s.section] = s.body;
    setSections(grid);
    setSkills(
      data.skills
        .filter((s): s is typeof s & { skill_id: string } => s.skill_id != null)
        .map((s) => ({
          skill_id: s.skill_id,
          skill_name: s.skill_name,
          level: s.min_level ?? undefined,
        })),
    );
    setEditing(true);
  }

  function cancelEditing() {
    setEditing(false);
  }

  function requestClose() {
    if (editing && !window.confirm('Discard unsaved changes?')) return;
    setEditing(false);
    onClose?.();
  }

  if (isLoading) {
    return (
      <div className="flex flex-col overflow-hidden">
        <div className="p-6 text-ink-muted">Loading…</div>
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="flex flex-col overflow-hidden p-6">
        <Alert variant="destructive">
          <AlertDescription>{(error as Error)?.message ?? 'Not found'}</AlertDescription>
        </Alert>
      </div>
    );
  }

  const req = data.requisition;
  // While editing, reflect the in-progress Account/Project/Grade selection instead of the
  // last-saved server values, so the subtitle updates live as the user picks a new one.
  const liveAccountName = editing
    ? (accounts?.find((a) => a.account_id === accountId)?.name ?? null)
    : data.account_name;
  const liveProjectName = editing
    ? (projects?.find((p) => p.project_id === projectId)?.name ?? null)
    : data.project_name;
  const liveGrade = editing ? grade : req.grade;
  const subtitle = [liveAccountName, liveProjectName, liveGrade && `Grade ${liveGrade}`, req.kind]
    .filter(Boolean)
    .join(' · ');

  return (
    <div
      className={`flex flex-col overflow-hidden ${variant === 'modal' ? 'min-h-0 flex-1' : 'h-full'}`}
    >
      <header className="flex items-start justify-between gap-4 border-b border-hairline bg-canvas px-6 py-4">
        <div className="min-w-0">
          <h1 className="truncate text-section-title font-semibold text-ink">
            {editing ? title : req.title}
          </h1>
          {subtitle && <p className="mt-0.5 truncate text-body-sm text-ink-muted">{subtitle}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {editing ? (
            <>
              <Button
                size="sm"
                variant="secondary"
                onClick={cancelEditing}
                disabled={save.isPending}
              >
                Cancel
              </Button>
              <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
                {save.isPending ? 'Saving…' : 'Save'}
              </Button>
            </>
          ) : (
            canManage && (
              <Button size="sm" variant="secondary" onClick={startEditing}>
                Edit
              </Button>
            )
          )}
          <button
            type="button"
            onClick={requestClose}
            aria-label="Close dialog"
            className="inline-flex size-8 items-center justify-center rounded-md text-ink-muted hover:bg-surface-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-focus"
          >
            <X className="size-5" />
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-auto">
        <div className="mx-auto max-w-[720px] space-y-5 px-6 py-5">
          {editing && (
            <div className="space-y-1">
              <Label htmlFor="jd-title">Job title</Label>
              <Input id="jd-title" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
          )}

          {editing && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="jd-grade">Grade</Label>
                <Select value={grade} onValueChange={setGrade}>
                  <SelectTrigger id="jd-grade" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {GRADES.map((g) => (
                      <SelectItem key={g} value={g}>
                        {g}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="jd-account">Account</Label>
                <Select
                  value={accountId}
                  onValueChange={(v) => {
                    setAccountId(v);
                    setProjectId('');
                  }}
                >
                  <SelectTrigger id="jd-account" className="w-full">
                    <SelectValue placeholder="No account" />
                  </SelectTrigger>
                  <SelectContent>
                    {(accounts ?? []).map((a) => (
                      <SelectItem key={a.account_id} value={a.account_id}>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="jd-project">Project</Label>
                <Select value={projectId} onValueChange={setProjectId} disabled={!accountId}>
                  <SelectTrigger id="jd-project" className="w-full">
                    <SelectValue placeholder={accountId ? 'No project' : 'Pick an account first'} />
                  </SelectTrigger>
                  <SelectContent>
                    {(projects ?? []).map((p) => (
                      <SelectItem key={p.project_id} value={p.project_id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {editing ? (
            <SkillPicker value={skills} onChange={setSkills} />
          ) : (
            data.skills.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {data.skills.map((s) => (
                  <Badge
                    key={s.skill_name}
                    variant="secondary"
                    className="rounded-md border border-hairline bg-surface-2 px-3 py-1.5 text-body-sm text-ink-muted"
                  >
                    {s.skill_name}
                    {s.min_level != null ? ` · ${LEVEL_LABEL[s.min_level] ?? s.min_level}` : ''}
                  </Badge>
                ))}
              </div>
            )
          )}

          {SECTIONS.map((s) => {
            const body = editing
              ? sections[s.key]
              : (data.jd_sections.find((j) => j.variant === jdVariant && j.section === s.key)
                  ?.body ?? '');
            if (!editing && !body) return null;
            return (
              <div key={s.key}>
                {s.key === 'about' ? (
                  <div className="rounded-lg bg-primary/8 p-4">
                    <div className="mb-1 font-semibold text-ink">{s.label}</div>
                    {editing ? (
                      <RichTextEditor
                        value={sections[s.key]}
                        onChange={(html) => setSections((g) => ({ ...g, [s.key]: html }))}
                        placeholder="Write the about section…"
                      />
                    ) : (
                      <RichTextDisplay value={body} />
                    )}
                  </div>
                ) : (
                  <div>
                    <div
                      className={`mb-1 font-semibold ${s.key === 'nice_to_have' ? 'text-ink-muted' : 'text-ink'}`}
                    >
                      {s.label}
                    </div>
                    {editing ? (
                      <RichTextEditor
                        value={sections[s.key]}
                        onChange={(html) => setSections((g) => ({ ...g, [s.key]: html }))}
                        placeholder={`Write the ${s.label.toLowerCase()}…`}
                      />
                    ) : (
                      <RichTextDisplay value={body} />
                    )}
                  </div>
                )}
              </div>
            );
          })}

          <p className="text-caption text-ink-subtle">
            Posted {req.created_at.slice(0, 10)}
            {req.due_date ? ` · closes ${req.due_date}` : ''}
          </p>
        </div>
      </div>

      {!editing && (
        <footer className="flex items-center justify-end border-t border-hairline bg-canvas px-6 py-3">
          <Button size="sm" variant="secondary" onClick={requestClose}>
            Close
          </Button>
        </footer>
      )}
    </div>
  );
}
