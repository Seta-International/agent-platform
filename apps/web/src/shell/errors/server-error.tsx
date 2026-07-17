import { Button, EmptyState } from '@seta/shared-ui';
import { CircleAlert } from 'lucide-react';

interface ServerErrorProps {
  error?: unknown;
  onReset?: () => void;
}

export function ServerError({ error, onReset }: ServerErrorProps) {
  const detail = error instanceof Error ? error.message : undefined;
  return (
    <div className="grid min-h-[70vh] place-items-center p-6">
      <div className="flex w-full max-w-lg flex-col items-center">
        <EmptyState
          headingLevel={2}
          icon={
            <span className="flex size-12 items-center justify-center rounded-full bg-error-muted">
              <CircleAlert className="size-6 text-error" />
            </span>
          }
          title="Something went wrong"
          description="An unexpected error occurred. Try again, or return home."
          actions={
            <>
              {/* Button defaults to secondary — the retry action must read as primary. */}
              <Button
                variant="primary"
                label="Try again"
                onClick={() => (onReset ? onReset() : window.location.reload())}
              />
              <Button
                variant="secondary"
                label="Go home"
                onClick={() => {
                  window.location.href = '/';
                }}
              />
            </>
          }
        />
        {detail && (
          <details className="w-full text-left">
            <summary className="cursor-pointer text-center text-sm text-secondary hover:text-primary">
              Technical details
            </summary>
            <pre className="mt-3 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-md border border-border bg-surface p-4 font-mono text-xs leading-relaxed text-secondary">
              {detail}
            </pre>
          </details>
        )}
      </div>
    </div>
  );
}
