import { Alert, Button } from '@seta/shared-ui';

interface ServerErrorProps {
  error?: unknown;
  onReset?: () => void;
}

export function ServerError({ error, onReset }: ServerErrorProps) {
  const message = error instanceof Error ? error.message : 'Something unexpected happened.';
  return (
    <div className="grid min-h-[60vh] place-items-center p-xl">
      <div className="max-w-md w-full space-y-md">
        <Alert variant="destructive">
          <div className="font-medium">Something went wrong on our end</div>
          <div className="text-body-sm">{message}</div>
        </Alert>
        <div className="flex gap-xs">
          <Button onClick={() => (onReset ? onReset() : window.location.reload())}>
            Try again
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              window.location.href = '/';
            }}
          >
            Take me home
          </Button>
        </div>
      </div>
    </div>
  );
}
