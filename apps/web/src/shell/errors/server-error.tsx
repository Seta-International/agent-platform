import { Alert, Button } from '@seta/shared-ui';

interface ServerErrorProps {
  error?: unknown;
  onReset?: () => void;
}

export function ServerError({ error, onReset }: ServerErrorProps) {
  const message = error instanceof Error ? error.message : 'An unexpected error occurred.';
  return (
    <div className="grid min-h-[60vh] place-items-center p-xl">
      <div className="max-w-md w-full space-y-md">
        <Alert variant="destructive">
          <div className="font-medium">Something went wrong</div>
          <div className="text-body-sm">{message}</div>
        </Alert>
        <div className="flex gap-xs">
          <Button onClick={() => (onReset ? onReset() : window.location.reload())}>Reload</Button>
          <Button
            variant="secondary"
            onClick={() => {
              window.location.href = '/';
            }}
          >
            Go home
          </Button>
        </div>
      </div>
    </div>
  );
}
