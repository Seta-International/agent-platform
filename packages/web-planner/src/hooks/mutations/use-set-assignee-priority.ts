import type { MyTasksResult, TaskRow, TaskWithPlan } from '@seta/planner';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { plannerClient } from '../../api/planner-client';

interface Vars {
  taskId: string;
  value: string;
}

export function useSetAssigneePriority() {
  const qc = useQueryClient();
  return useMutation<
    TaskRow,
    Error,
    Vars,
    { snapshots: Array<[readonly unknown[], MyTasksResult]> }
  >({
    mutationFn: (v) => plannerClient.setAssigneePriority({ task_id: v.taskId, value: v.value }),
    onMutate: async (v) => {
      await qc.cancelQueries({
        predicate: (q) => q.queryKey[0] === 'planner' && q.queryKey[1] === 'myTasks',
      });
      const entries = qc.getQueriesData<MyTasksResult>({
        predicate: (q) => q.queryKey[0] === 'planner' && q.queryKey[1] === 'myTasks',
      });
      const snapshots: Array<[readonly unknown[], MyTasksResult]> = [];
      for (const [key, data] of entries) {
        if (!data) continue;
        snapshots.push([key, data]);
        qc.setQueryData<MyTasksResult>(key, patchTaskInResult(data, v.taskId, v.value));
      }
      return { snapshots };
    },
    onError: (_err, _vars, ctx) => {
      if (!ctx) return;
      for (const [key, data] of ctx.snapshots) {
        qc.setQueryData(key, data);
      }
    },
    onSettled: () => {
      qc.invalidateQueries({
        predicate: (q) => q.queryKey[0] === 'planner' && q.queryKey[1] === 'myTasks',
      });
    },
  });
}

function patchTaskInResult(data: MyTasksResult, taskId: string, value: string): MyTasksResult {
  const sections: Array<keyof MyTasksResult> = [
    'late',
    'dueThisWeek',
    'inProgress',
    'notStarted',
    'recentlyCompleted',
  ];
  for (const k of sections) {
    const idx = data[k].findIndex((t) => t.id === taskId);
    if (idx === -1) continue;
    const source = data[k][idx] as TaskWithPlan;
    const updated: TaskWithPlan = { ...source, assignee_priority: value, plan: source.plan };
    const next = [...data[k]];
    next[idx] = updated;
    next.sort((a, b) => {
      const ap = a.assignee_priority,
        bp = b.assignee_priority;
      if (ap === bp) return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
      if (ap === null) return 1;
      if (bp === null) return -1;
      return ap < bp ? -1 : 1;
    });
    return { ...data, [k]: next };
  }
  return data;
}
