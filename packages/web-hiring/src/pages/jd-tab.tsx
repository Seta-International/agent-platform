import {
  Button,
  RichTextEditor,
  SegmentedControl,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
} from '@seta/shared-ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import {
  fetchJdTemplates,
  type JdSectionKey,
  type JdVariant,
  type RequisitionDetail,
  setRequisitionJd,
} from '../api/hiring-client.ts';
import { hiringKeys } from '../state/query-keys.ts';
import { on409 } from './utils.ts';

const SECTIONS: { key: JdSectionKey; label: string }[] = [
  { key: 'about', label: 'About the role' },
  { key: 'responsibilities', label: 'Responsibilities' },
  { key: 'requirements', label: 'Requirements' },
  { key: 'nice_to_have', label: 'Nice to have' },
];
type Grid = Record<JdVariant, Record<JdSectionKey, string>>;

function emptyGrid(): Grid {
  const blank = { about: '', responsibilities: '', requirements: '', nice_to_have: '' };
  return { external: { ...blank }, internal: { ...blank } };
}

export function JdTab({ detail, canManage }: { detail: RequisitionDetail; canManage: boolean }) {
  const queryClient = useQueryClient();
  const id = detail.requisition.id;
  const initial = useMemo(() => {
    const g = emptyGrid();
    for (const s of detail.jd_sections) g[s.variant][s.section] = s.body;
    return g;
  }, [detail.jd_sections]);

  const [variant, setVariant] = useState<JdVariant>('external');
  const [grid, setGrid] = useState<Grid>(initial);
  const [templatePickerKey, setTemplatePickerKey] = useState(0);
  const templates = useQuery({ queryKey: hiringKeys.jdTemplates(), queryFn: fetchJdTemplates });

  const save = useMutation({
    mutationFn: () => {
      const sections = (['external', 'internal'] as JdVariant[]).flatMap((v) =>
        SECTIONS.filter((s) => grid[v][s.key].trim()).map((s) => ({
          requisition_id: id,
          variant: v,
          section: s.key,
          body: grid[v][s.key],
        })),
      );
      return setRequisitionJd(id, { expected_version: detail.requisition.version, sections });
    },
    onSuccess: () => {
      toast.success('Job description saved');
      void queryClient.invalidateQueries({ queryKey: hiringKeys.requisition(id) });
    },
    onError: (e: Error) => on409(e, queryClient, hiringKeys.requisition(id)),
  });

  function applyTemplate(templateId: string) {
    const t = templates.data?.find((x) => x.template.id === templateId);
    if (!t) return;
    setGrid((g) => {
      const next: Grid = { external: { ...g.external }, internal: { ...g.internal } };
      for (const s of t.sections) next[s.variant][s.section] = s.body;
      return next;
    });
    toast.success('Template applied — review and save');
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <SegmentedControl
          value={variant}
          onValueChange={(v) => setVariant(v as JdVariant)}
          options={[
            { value: 'external', label: 'External' },
            { value: 'internal', label: 'Internal' },
          ]}
        />
        {canManage && (
          <div className="flex items-center gap-2">
            {(templates.data?.length ?? 0) > 0 && (
              <Select
                key={templatePickerKey}
                onValueChange={(v) => {
                  applyTemplate(v);
                  setTemplatePickerKey((k) => k + 1);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Apply template…" />
                </SelectTrigger>
                <SelectContent>
                  {templates.data?.map((t) => (
                    <SelectItem key={t.template.id} value={t.template.id}>
                      {t.template.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending ? 'Saving…' : 'Save JD'}
            </Button>
          </div>
        )}
      </div>
      {SECTIONS.map((s) => (
        <div key={s.key} className="space-y-1">
          <div className="text-caption font-semibold text-ink">{s.label}</div>
          <RichTextEditor
            value={grid[variant][s.key]}
            onChange={(html) =>
              setGrid((g) => ({ ...g, [variant]: { ...g[variant], [s.key]: html } }))
            }
            placeholder={canManage ? `Write the ${s.label.toLowerCase()}…` : undefined}
          />
        </div>
      ))}
    </div>
  );
}
