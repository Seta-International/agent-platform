import { Button, Input, toast } from '@seta/shared-ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { type RequisitionDetail, setRequisitionSkills } from '../api/hiring-client.ts';
import { hiringKeys } from '../state/query-keys.ts';
import { on409 } from './utils.ts';

interface Row {
  skill_name: string;
  min_level: number | null;
}

export function SkillsTab({
  detail,
  canManage,
}: {
  detail: RequisitionDetail;
  canManage: boolean;
}) {
  const queryClient = useQueryClient();
  const id = detail.requisition.id;
  const [rows, setRows] = useState<Row[]>(
    detail.skills.map((s) => ({ skill_name: s.skill_name, min_level: s.min_level })),
  );

  const save = useMutation({
    mutationFn: () =>
      setRequisitionSkills(id, {
        expected_version: detail.requisition.version,
        skills: rows
          .filter((r) => r.skill_name.trim())
          .map((r) => ({ skill_name: r.skill_name.trim(), min_level: r.min_level ?? undefined })),
      }),
    onSuccess: () => {
      toast.success('Skills saved');
      void queryClient.invalidateQueries({ queryKey: hiringKeys.requisition(id) });
    },
    onError: (e: Error) => on409(e, queryClient, id),
  });

  if (!canManage) {
    return (
      <div className="flex flex-wrap gap-2">
        {detail.skills.length === 0 ? (
          <span className="text-ink-muted">No skills set.</span>
        ) : (
          detail.skills.map((s) => (
            <span
              key={s.skill_name}
              className="rounded-full bg-surface-2 px-3 py-1 text-caption text-ink"
            >
              {s.skill_name}
              {s.min_level != null ? ` · ${s.min_level}` : ''}
            </span>
          ))
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {rows.map((r, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: stable positional rows
        <div key={i} className="flex items-center gap-2">
          <Input
            className="flex-1"
            value={r.skill_name}
            placeholder="Skill"
            onChange={(e) =>
              setRows((rs) =>
                rs.map((x, j) => (j === i ? { ...x, skill_name: e.target.value } : x)),
              )
            }
          />
          <Input
            className="w-24"
            type="number"
            min={0}
            max={5}
            value={r.min_level ?? ''}
            placeholder="Level"
            onChange={(e) =>
              setRows((rs) =>
                rs.map((x, j) =>
                  j === i
                    ? { ...x, min_level: e.target.value === '' ? null : Number(e.target.value) }
                    : x,
                ),
              )
            }
          />
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}
          >
            Remove
          </Button>
        </div>
      ))}
      <div className="flex justify-between">
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setRows((rs) => [...rs, { skill_name: '', min_level: null }])}
        >
          Add skill
        </Button>
        <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? 'Saving…' : 'Save skills'}
        </Button>
      </div>
    </div>
  );
}
