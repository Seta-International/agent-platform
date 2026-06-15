import type { TaskList } from 'graphile-worker';
import { type RunEvaluationPayload, runEvaluation } from './run-evaluation.ts';

export const evaluationJobs: TaskList = {
  evaluation_run: async (payload) => {
    await runEvaluation(payload as RunEvaluationPayload);
  },
};
