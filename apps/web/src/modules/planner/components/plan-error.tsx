import { Button } from '@seta/shared-ui';

interface Props {
  error?: unknown;
  onRetry: () => void;
  onBack?: () => void;
}

function categoryOf(err: unknown): string {
  if (err instanceof Error) {
    const m = err.message.toLowerCase();
    if (m.includes('network') || m.includes('fetch') || m.includes('timeout')) return 'Network';
    if (m.includes('forbidden') || m.includes('permission') || m.includes('403'))
      return 'Permission';
    if (m.includes('404') || m.includes('not found')) return 'Not found';
  }
  return 'Server';
}

export function PlanError({ error, onRetry, onBack }: Props) {
  const category = categoryOf(error);
  const title =
    category === 'Network'
      ? "Couldn't reach the server"
      : category === 'Permission'
        ? "You don't have access to this plan"
        : category === 'Not found'
          ? "This plan doesn't exist"
          : "Couldn't load the plan";
  const detail =
    error instanceof Error ? error.message : typeof error === 'string' ? error : undefined;
  return (
    <div role="alert" className="plan-error">
      <h2 className="text-card-title text-ink">{title}</h2>
      <p className="mt-1 text-body-sm text-ink-subtle">
        {category === 'Network'
          ? 'Check your connection and try again.'
          : category === 'Permission'
            ? 'Ask your tenant admin for access.'
            : 'Something went wrong on our end.'}
      </p>
      <div className="mt-3 flex gap-2">
        <Button size="sm" onClick={onRetry}>
          Retry
        </Button>
        {onBack && (
          <Button size="sm" variant="ghost" onClick={onBack}>
            Go back
          </Button>
        )}
      </div>
      {detail && (
        <details className="mt-3 text-xs text-ink-subtle">
          <summary>Technical details</summary>
          <pre className="mt-1 whitespace-pre-wrap break-words">{detail}</pre>
        </details>
      )}
    </div>
  );
}
