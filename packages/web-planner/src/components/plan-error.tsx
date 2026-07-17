import { Banner, Button, HStack } from '@seta/shared-ui';

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
    <div className="m-6">
      <Banner
        status="error"
        title={title}
        description={
          <>
            {category === 'Network'
              ? 'Check your connection and try again.'
              : category === 'Permission'
                ? 'Ask your admin for access.'
                : 'Something went wrong on our end.'}
            {detail && (
              // Kept as <details> rather than Banner's children slot: that slot's
              // toggle is labelled "Expand", losing the "Technical details" affordance.
              <details className="mt-3 text-xs text-secondary">
                <summary>Technical details</summary>
                <pre className="mt-1 whitespace-pre-wrap break-words">{detail}</pre>
              </details>
            )}
          </>
        }
        endContent={
          <HStack gap={2}>
            <Button size="sm" label="Try again" onClick={onRetry} />
            {onBack && <Button size="sm" variant="ghost" label="Go back" onClick={onBack} />}
          </HStack>
        }
      />
    </div>
  );
}
