import { Button, toast } from '@seta/shared-ui';
import { Link, useNavigate } from '@tanstack/react-router';
import { Loader2, Sparkles } from 'lucide-react';
import { useStartAssignBySkill } from '../api/start-assign-by-skill';

interface Props {
  taskId: string;
  taskTitle: string;
  /** Non-null when an assignBySkill run is already suspended for this task. */
  pendingAssignWorkflowRunId?: string | null;
}

/**
 * Out-of-chat trigger for the assignBySkill workflow (spec §4.2).
 * POSTs to /api/copilot/v1/workflows/runs/assignBySkill/start and surfaces
 * the run via the workflow-approvals inbox — never via the chat panel.
 *
 * When a run is already pending for this task (spec §5.8), renders a deep
 * link to that run instead of starting a second one.
 */
export function SuggestAssigneeButton({ taskId, taskTitle, pendingAssignWorkflowRunId }: Props) {
  const navigate = useNavigate();
  const start = useStartAssignBySkill();

  if (pendingAssignWorkflowRunId) {
    return (
      <Link
        to="/copilot/workflows/runs/$runId"
        params={{ runId: pendingAssignWorkflowRunId }}
        aria-label="View pending Suggest run"
        data-testid="suggest-in-progress-link"
      >
        <Button size="sm" variant="secondary" type="button">
          <Loader2 className="size-3 animate-spin" />
          Suggest in progress — view
        </Button>
      </Link>
    );
  }

  const onClick = () =>
    start.mutate(taskId, {
      onSuccess: ({ runId }) => {
        toast.success('Suggest started', {
          description: `Ranking candidates for "${taskTitle}".`,
          action: {
            label: 'Open in inbox',
            onClick: () => {
              void navigate({ to: '/copilot/workflows/runs/$runId', params: { runId } });
            },
          },
        });
      },
      onError: (err) =>
        toast.error("Couldn't start Suggest", {
          description: err instanceof Error ? err.message : String(err),
        }),
    });

  return (
    <Button
      size="sm"
      variant="ghost"
      onClick={onClick}
      disabled={start.isPending}
      aria-label="Suggest assignee"
      type="button"
    >
      {start.isPending ? (
        <Loader2 className="size-3 animate-spin" />
      ) : (
        <Sparkles className="size-3" />
      )}
      Suggest
    </Button>
  );
}
