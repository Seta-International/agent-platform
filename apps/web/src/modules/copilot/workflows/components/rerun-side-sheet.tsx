import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@seta/shared-ui';
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
}

export function RerunSideSheet({
  open,
  runId,
  workflowId,
  priorInputSummary,
  onClose,
}: RerunSideSheetProps) {
  const navigate = useNavigate();

  const schemaQ = useQuery({
    queryKey: ['copilot', 'workflows', workflowId, 'input-schema'],
    queryFn: async () => {
      const schema = await workflowsApi.getInputSchema(workflowId);
      if (!schema) throw new Error('schema_unavailable');
      return schema;
    },
    enabled: open,
  });

  const submit = useMutation({
    mutationFn: (values: Record<string, unknown>) => workflowsApi.rerunRun(runId, values),
    onSuccess: (out) => {
      onClose();
      void navigate({
        to: '/copilot/workflows/runs/$runId',
        params: { runId: out.runId },
        search: {},
      });
    },
  });

  return (
    <Sheet open={open} onOpenChange={(v) => (v ? null : onClose())}>
      <SheetContent side="right" className="w-[480px] sm:max-w-none">
        <SheetHeader>
          <SheetTitle>Re-run workflow</SheetTitle>
        </SheetHeader>
        <div className="mt-4">
          {schemaQ.isLoading ? (
            <div className="text-sm text-[var(--color-ink-subtle)]">Loading input schema…</div>
          ) : null}
          {schemaQ.isError ? (
            <div className="text-sm text-[var(--color-danger)]">
              Failed to load input schema for this workflow.
            </div>
          ) : null}
          {schemaQ.data ? (
            <InputFormFromSchema
              schema={schemaQ.data}
              defaults={renderRerunInput(priorInputSummary)}
              onSubmit={(v) => submit.mutate(v)}
              submitting={submit.isPending}
              submitLabel="Re-run"
            />
          ) : null}
          {submit.isError ? (
            <p className="mt-3 text-xs text-[var(--color-danger)]">
              Re-run failed. Adjust inputs and try again.
            </p>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
