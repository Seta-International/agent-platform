import { Loader2, Upload } from 'lucide-react';
import type * as React from 'react';
import { useCallback, useRef, useState } from 'react';
import { cn } from '../lib/cn';

export interface DropzoneProps {
  /** Comma-separated `accept` attribute for the hidden file input (e.g. `.pdf,.csv`). */
  accept?: string;
  /** Max bytes; files larger than this surface the `tooLargeMessage` instead of calling `onFile`. */
  maxBytes?: number;
  /** Primary call-to-action label rendered when idle. */
  label?: string;
  /** Secondary helper line (formats, size limit). */
  hint?: string;
  /** Shown while pending; spinner replaces the upload icon. */
  pendingLabel?: string;
  /** Shown above the dropzone when `maxBytes` is exceeded. */
  tooLargeMessage?: string;
  /** External error to render under the dropzone (e.g. server failure). */
  error?: string | null;
  /** Disables interaction and shows the pending spinner. */
  isPending?: boolean;
  /** Called when a valid file is selected (size check has passed). */
  onFile: (file: File) => void;
  className?: string;
}

const DEFAULT_TOO_LARGE = 'File exceeds the size limit.';

export function Dropzone({
  accept,
  maxBytes,
  label = 'Drop a file or click to upload',
  hint,
  pendingLabel = 'Uploading…',
  tooLargeMessage = DEFAULT_TOO_LARGE,
  error,
  isPending = false,
  onFile,
  className,
}: DropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [sizeError, setSizeError] = useState<string | null>(null);

  const accept_ = accept;
  const dispatch = useCallback(
    (file: File) => {
      if (maxBytes !== undefined && file.size > maxBytes) {
        setSizeError(tooLargeMessage);
        return;
      }
      setSizeError(null);
      onFile(file);
    },
    [maxBytes, onFile, tooLargeMessage],
  );

  const onClick = useCallback(() => {
    if (!isPending) inputRef.current?.click();
  }, [isPending]);

  const onChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) dispatch(file);
      e.target.value = '';
    },
    [dispatch],
  );

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);
      if (isPending) return;
      const file = e.dataTransfer.files?.[0];
      if (file) dispatch(file);
    },
    [isPending, dispatch],
  );

  const visibleError = sizeError ?? error ?? null;

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <input
        ref={inputRef}
        type="file"
        accept={accept_}
        onChange={onChange}
        className="hidden"
        disabled={isPending}
        aria-hidden
      />

      <button
        type="button"
        onClick={onClick}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        disabled={isPending}
        className={cn(
          'flex flex-col items-center justify-center gap-3',
          'min-h-[160px] w-full rounded-lg border-2 border-dashed p-6',
          'cursor-pointer transition-colors',
          'border-hairline bg-canvas text-ink-subtle',
          'hover:border-hairline-strong hover:bg-surface-1',
          isDragOver && 'border-primary-border bg-primary-tint text-ink',
          visibleError && 'border-destructive/40 bg-destructive-tint',
          isPending && 'cursor-wait opacity-60',
        )}
        aria-label={label}
      >
        {isPending ? (
          <>
            <Loader2 className="size-8 animate-spin text-ink-subtle" />
            <span className="text-body-sm text-ink-subtle">{pendingLabel}</span>
          </>
        ) : (
          <>
            <Upload className="size-8 text-ink-tertiary" />
            <div className="flex flex-col items-center gap-1">
              <span className="text-body-sm font-medium text-ink">{label}</span>
              {hint && (
                <span className="text-eyebrow uppercase tracking-[0.04em] text-ink-subtle">
                  {hint}
                </span>
              )}
            </div>
          </>
        )}
      </button>

      {visibleError && (
        <p role="alert" className="text-body-sm text-destructive">
          {visibleError}
        </p>
      )}
    </div>
  );
}
