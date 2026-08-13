import { Dialog, DialogHeader, Layout, LayoutContent } from '@seta/shared-ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { workflowsApi } from '../api/workflows.ts';
import { renderRerunInput } from '../lib/render-rerun-input.ts';
import { InputFormFromSchema } from './input-form-from-schema.tsx';

export interface RerunSideSheetProps {
  open: boolean;
  runId: string;
  workflowId: string;
  priorInputSummary: unknown;
  onClose: () => void;
  mode?: 'rerun' | 'replay-from-step';
  replayContext?: { stepId: string; originalPayload: unknown };
}

export function RerunSideSheet({
  open,
  runId,
  workflowId,
  priorInputSummary,
  onClose,
  mode = 'rerun',
  replayContext,
}: RerunSideSheetProps) {
  const navigate = useNavigate();

  const schemaQ = useQuery({
    queryKey: ['agent', 'workflows', workflowId, 'input-schema'],
    queryFn: async () => {
      const schema = await workflowsApi.getInputSchema(workflowId);
      if (!schema) throw new Error('schema_unavailable');
      return schema;
    },
    enabled: open,
  });

  const submit = useMutation({
    mutationFn: async (values: Record<string, unknown>) => {
      if (mode === 'replay-from-step' && replayContext) {
        const out = await workflowsApi.replayFromStep(runId, replayContext.stepId, values);
        return { runId: out.newRunId };
      }
      const out = await workflowsApi.rerunRun(runId, values);
      return { runId: out.newRunId };
    },
    onSuccess: (out) => {
      onClose();
      void navigate({
        to: '/agent/workflows/runs/$runId',
        params: { runId: out.runId },
        search: {},
      });
    },
  });

  const isReplay = mode === 'replay-from-step' && replayContext !== undefined;
  const title = isReplay ? 'Replay from step' : 'Re-run workflow';
  const submitLabel = isReplay ? 'Replay from step' : 'Re-run';
  const rerunDefaults = renderRerunInput(priorInputSummary);
  const defaults =
    isReplay && replayContext
      ? (replayContext.originalPayload as Record<string, unknown>)
      : rerunDefaults;
  const original =
    isReplay && replayContext
      ? (replayContext.originalPayload as Record<string, unknown>)
      : (rerunDefaults as Record<string, unknown>);

  return (
    <Dialog
      isOpen={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
      purpose="form"
      position={{ top: 0, end: 0, bottom: 0 }}
      width={480}
      maxHeight="100dvh"
      // Astryx's Dialog does not label itself from DialogHeader (only AlertDialog does),
      // so name it explicitly to keep the accessible name the drawer has always had.
      aria-label={title}
    >
      <Layout
        header={
          <DialogHeader
            title={title}
            onOpenChange={(v) => {
              if (!v) onClose();
            }}
          />
        }
        content={
          <LayoutContent>
            {isReplay && replayContext ? (
              <div className="mt-3 rounded border border-[var(--color-border)] bg-[var(--color-background-card)] px-3 py-2 text-xs text-[var(--color-text-secondary)]">
                Replaying from step <span className="font-mono">{replayContext.stepId}</span>.
                Earlier steps' outputs are reused; this step receives the input below.
              </div>
            ) : null}
            <div className="mt-4">
              {schemaQ.isLoading ? (
                <div className="text-sm text-[var(--color-text-secondary)]">
                  Loading input schema…
                </div>
              ) : null}
              {schemaQ.isError ? (
                <div className="text-sm text-[var(--color-error)]">
                  Failed to load input schema for this workflow.
                </div>
              ) : null}
              {schemaQ.data ? (
                <InputFormFromSchema
                  schema={schemaQ.data}
                  defaults={defaults}
                  original={original}
                  onSubmit={(v) => submit.mutate(v)}
                  submitting={submit.isPending}
                  submitLabel={submitLabel}
                />
              ) : null}
              {submit.isError ? (
                <p className="mt-3 text-xs text-[var(--color-error)]">
                  {isReplay ? 'Replay failed.' : 'Re-run failed.'} Adjust inputs and try again.
                </p>
              ) : null}
            </div>
          </LayoutContent>
        }
      />
    </Dialog>
  );
}
