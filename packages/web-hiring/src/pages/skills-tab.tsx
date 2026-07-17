import { Button, useToast } from '@seta/shared-ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { type RequisitionDetail, setRequisitionSkills } from '../api/hiring-client.ts';
import { hiringKeys } from '../state/query-keys.ts';
import { type PickedSkill, SkillPicker } from './skill-picker.tsx';
import { on409 } from './utils.ts';

export function SkillsTab({
  detail,
  canManage,
}: {
  detail: RequisitionDetail;
  canManage: boolean;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const id = detail.requisition.id;
  const [skills, setSkills] = useState<PickedSkill[]>(
    detail.skills
      .filter((s): s is typeof s & { skill_id: string } => s.skill_id != null)
      .map((s) => ({
        skill_id: s.skill_id,
        skill_name: s.skill_name,
        level: s.min_level ?? undefined,
      })),
  );

  const save = useMutation({
    mutationFn: () =>
      setRequisitionSkills(id, {
        expected_version: detail.requisition.version,
        skills: skills.map((s) => ({
          skill_id: s.skill_id,
          skill_name: s.skill_name,
          min_level: s.level,
        })),
      }),
    onSuccess: () => {
      toast({ body: 'Skills saved' });
      void queryClient.invalidateQueries({ queryKey: hiringKeys.requisition(id) });
    },
    onError: (e: Error) => on409(toast, e, queryClient, hiringKeys.requisition(id)),
  });

  if (!canManage) {
    return (
      <div className="flex flex-wrap gap-2">
        {detail.skills.length === 0 ? (
          <span className="text-secondary">No skills set.</span>
        ) : (
          detail.skills.map((s) => (
            <span
              key={s.skill_name}
              className="rounded-full bg-surface px-3 py-1 text-sm text-primary"
            >
              {s.skill_name}
              {s.min_level ? ` · ${s.min_level}` : ''}
            </span>
          ))
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <SkillPicker value={skills} onChange={setSkills} />
      <div className="flex justify-end">
        <Button
          size="sm"
          variant="primary"
          label={save.isPending ? 'Saving…' : 'Save skills'}
          onClick={() => save.mutate()}
          isDisabled={save.isPending}
        />
      </div>
    </div>
  );
}
