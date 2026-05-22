import { useState } from 'react';
import { Button } from '../primitives/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../primitives/dialog';
import { FieldConflictRow } from './field-conflict-row';
import { TaskConflictGroup } from './task-conflict-group';

export interface PlanConflictsPayload {
  planId: string;
  planLevelConflicts: Array<{ field: string; local: unknown; remote: unknown; snapshot?: unknown }>;
  taskConflicts: Array<{
    taskId: string;
    taskTitle: string;
    taskUrl: string;
    fields: Array<{ field: string; local: unknown; remote: unknown; snapshot?: unknown }>;
  }>;
}

export type PlanConflictDecision =
  | { kind: 'plan'; field: string; choice: 'local' | 'remote' }
  | { kind: 'task'; taskId: string; field: string; choice: 'local' | 'remote' };

export interface ResolvePlanConflictsDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  data: PlanConflictsPayload;
  onApply: (decisions: PlanConflictDecision[]) => Promise<void>;
}

export function ResolvePlanConflictsDialog(p: ResolvePlanConflictsDialogProps) {
  const [planDecisions, setPlanDecisions] = useState<Record<string, 'local' | 'remote'>>({});
  const [taskDecisions, setTaskDecisions] = useState<
    Record<string, Record<string, 'local' | 'remote'>>
  >({});
  const [submitting, setSubmitting] = useState(false);

  const totalFields =
    p.data.planLevelConflicts.length +
    p.data.taskConflicts.reduce((acc, t) => acc + t.fields.length, 0);

  const taskCount = p.data.taskConflicts.length;

  const chosen =
    Object.keys(planDecisions).length +
    p.data.taskConflicts.reduce(
      (acc, t) => acc + Object.keys(taskDecisions[t.taskId] ?? {}).length,
      0,
    );

  const unresolved = totalFields - chosen;

  function handlePlanChoose(field: string, choice: 'local' | 'remote') {
    setPlanDecisions((prev) => ({ ...prev, [field]: choice }));
  }

  function handleTaskChoose(taskId: string, field: string, choice: 'local' | 'remote') {
    setTaskDecisions((prev) => ({
      ...prev,
      [taskId]: { ...(prev[taskId] ?? {}), [field]: choice },
    }));
  }

  function bulkChoose(choice: 'local' | 'remote') {
    const newPlan: Record<string, 'local' | 'remote'> = {};
    for (const c of p.data.planLevelConflicts) {
      newPlan[c.field] = choice;
    }
    setPlanDecisions(newPlan);

    const newTask: Record<string, Record<string, 'local' | 'remote'>> = {};
    for (const t of p.data.taskConflicts) {
      const taskEntry: Record<string, 'local' | 'remote'> = {};
      for (const f of t.fields) {
        taskEntry[f.field] = choice;
      }
      newTask[t.taskId] = taskEntry;
    }
    setTaskDecisions(newTask);
  }

  function buildDecisions(): PlanConflictDecision[] {
    const decisions: PlanConflictDecision[] = [];
    for (const [field, choice] of Object.entries(planDecisions)) {
      decisions.push({ kind: 'plan', field, choice });
    }
    for (const t of p.data.taskConflicts) {
      const tDecisions = taskDecisions[t.taskId] ?? {};
      for (const [field, choice] of Object.entries(tDecisions)) {
        decisions.push({ kind: 'task', taskId: t.taskId, field, choice });
      }
    }
    return decisions;
  }

  async function handleApply() {
    if (chosen < totalFields || submitting) return;
    setSubmitting(true);
    try {
      await p.onApply(buildDecisions());
      resetState();
      p.onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  }

  function resetState() {
    setPlanDecisions({});
    setTaskDecisions({});
  }

  function handleOpenChange(v: boolean) {
    if (!v) resetState();
    p.onOpenChange(v);
  }

  return (
    <Dialog open={p.open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Resolve sync conflicts</DialogTitle>
          <DialogDescription>
            {totalFields} fields across {taskCount} task(s) have diverged between Seta and M365
            Planner since the last sync. Pick which value to keep for each.
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-2 pt-1">
          <Button variant="secondary" size="sm" onClick={() => bulkChoose('local')}>
            Use Seta for all
          </Button>
          <Button variant="secondary" size="sm" onClick={() => bulkChoose('remote')}>
            Use M365 for all
          </Button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto space-y-4 pr-1">
          {p.data.planLevelConflicts.length > 0 && (
            <section>
              <h3 className="text-xs font-semibold text-ink-subtle uppercase tracking-wide mb-2">
                Plan-level fields
              </h3>
              <div className="space-y-3">
                {p.data.planLevelConflicts.map((c) => (
                  <FieldConflictRow
                    key={c.field}
                    field={c.field}
                    local={c.local}
                    remote={c.remote}
                    snapshot={c.snapshot}
                    choice={planDecisions[c.field] ?? null}
                    onChoose={(choice) => handlePlanChoose(c.field, choice)}
                  />
                ))}
              </div>
            </section>
          )}

          {p.data.taskConflicts.map((t, i) => (
            <TaskConflictGroup
              key={t.taskId}
              taskId={t.taskId}
              taskTitle={t.taskTitle}
              taskUrl={t.taskUrl}
              fields={t.fields}
              decisions={taskDecisions[t.taskId] ?? {}}
              onChoose={(field, choice) => handleTaskChoose(t.taskId, field, choice)}
              defaultOpen={i === 0}
            />
          ))}
        </div>

        <DialogFooter className="items-center gap-2">
          <span className="text-xs text-ink-subtle mr-auto">
            {unresolved} unresolved · {chosen} chosen
          </span>
          <Button variant="secondary" onClick={() => handleOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleApply} disabled={chosen < totalFields || submitting}>
            Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
