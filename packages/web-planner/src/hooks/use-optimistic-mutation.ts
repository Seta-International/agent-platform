import { type QueryClient, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSavingIds } from '../state/saving-ids';

export interface RollbackEntry {
  key: readonly unknown[];
  prev: unknown;
}
export type RollbackLedger = RollbackEntry[];

export interface OptimisticMutationOpts<TVars, TResult> {
  mutationFn: (vars: TVars) => Promise<TResult>;
  snapshot: (vars: TVars, qc: QueryClient) => RollbackLedger;
  applyOptimistic: (vars: TVars, qc: QueryClient) => void;
  onServerOk: (result: TResult, vars: TVars, qc: QueryClient) => void;
  savingId: (vars: TVars) => string | undefined;
  invalidate: (vars: TVars, result: TResult | undefined) => readonly (readonly unknown[])[];
  errorMessage: (err: unknown, vars: TVars) => string;
  onConflict?: (err: unknown, vars: TVars, qc: QueryClient) => void;
}

const INVALIDATE_DEBOUNCE_MS = 300;

interface Ctx {
  ledger: RollbackLedger;
  savingId: string | undefined;
}

export function useOptimisticMutation<TVars, TResult>(
  opts: OptimisticMutationOpts<TVars, TResult>,
) {
  const qc = useQueryClient();
  const savingAdd = useSavingIds((s) => s.add);
  const savingRemove = useSavingIds((s) => s.remove);

  return useMutation<TResult, unknown, TVars, Ctx>({
    mutationFn: opts.mutationFn,
    onMutate: async (vars) => {
      const ledger = opts.snapshot(vars, qc);
      const savingId = opts.savingId(vars);
      if (savingId) savingAdd(savingId);
      opts.applyOptimistic(vars, qc);
      return { ledger, savingId };
    },
    onError: (err, vars, ctx) => {
      for (const e of ctx?.ledger ?? []) qc.setQueryData(e.key, e.prev);
      if (ctx?.savingId) savingRemove(ctx.savingId);
      if (
        opts.onConflict &&
        typeof err === 'object' &&
        err !== null &&
        (err as { status?: number }).status === 409
      ) {
        opts.onConflict(err, vars, qc);
      }
    },
    onSuccess: (result, vars) => {
      opts.onServerOk(result, vars, qc);
    },
    onSettled: (result, _err, vars, ctx) => {
      if (ctx?.savingId) savingRemove(ctx.savingId);
      const keys = opts.invalidate(vars, result);
      setTimeout(() => {
        for (const k of keys) qc.invalidateQueries({ queryKey: k });
      }, INVALIDATE_DEBOUNCE_MS);
    },
  });
}
