import { Banner, Button } from '@seta/shared-ui';

interface ServerErrorProps {
  error?: unknown;
  onReset?: () => void;
}

export function ServerError({ error, onReset }: ServerErrorProps) {
  const message = error instanceof Error ? error.message : 'Something unexpected happened.';
  return (
    <div className="grid min-h-[60vh] place-items-center p-xl">
      <div className="max-w-md w-full space-y-md">
        <Banner status="error" title="Something went wrong on our end" description={message} />
        <div className="flex gap-xs">
          <Button
            label="Try again"
            onClick={() => (onReset ? onReset() : window.location.reload())}
          />
          <Button
            variant="secondary"
            label="Take me home"
            onClick={() => {
              window.location.href = '/';
            }}
          />
        </div>
      </div>
    </div>
  );
}
