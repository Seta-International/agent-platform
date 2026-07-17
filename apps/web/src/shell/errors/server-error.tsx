import { Button, Heading, Text } from '@seta/shared-ui';
import { CircleAlert } from 'lucide-react';

interface ServerErrorProps {
  error?: unknown;
  onReset?: () => void;
}

export function ServerError({ error, onReset }: ServerErrorProps) {
  const detail = error instanceof Error ? error.message : undefined;
  return (
    <div className="grid min-h-[70vh] place-items-center p-xl">
      <div className="flex w-full max-w-lg flex-col items-center gap-lg text-center">
        <span className="flex size-14 items-center justify-center rounded-full bg-error-muted">
          <CircleAlert className="size-7 text-error" aria-hidden />
        </span>

        <div className="flex flex-col items-center gap-xs">
          <Heading level={2}>Something went wrong on our end</Heading>
          <Text color="secondary">
            The app hit an unexpected error. Trying again usually fixes it — if it keeps happening,
            head home and retry from there.
          </Text>
        </div>

        <div className="flex items-center gap-sm">
          {/* Button defaults to secondary — the retry action must read as primary. */}
          <Button
            variant="primary"
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

        {detail && (
          <details className="w-full text-left">
            <summary className="cursor-pointer text-center text-sm text-secondary hover:text-primary">
              Technical details
            </summary>
            <pre className="mt-sm max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-md border border-border bg-surface p-md font-mono text-xs leading-relaxed text-secondary">
              {detail}
            </pre>
          </details>
        )}
      </div>
    </div>
  );
}
