import { cn } from '@seta/shared-ui';
import { Loader2, Upload } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import { useUploadKnowledgeFile } from '../hooks/use-knowledge-files';

const ACCEPT = '.pdf,.docx,.xlsx,.csv,.txt,.md';
const MAX_BYTES = 50 * 1024 * 1024;

function validateFile(file: File): string | null {
  if (file.size > MAX_BYTES) return 'File exceeds the 50 MB limit. Please choose a smaller file.';
  return null;
}

export function UploadDropzone() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const upload = useUploadKnowledgeFile();

  const handleFile = useCallback(
    (file: File) => {
      const err = validateFile(file);
      if (err) {
        setValidationError(err);
        return;
      }
      setValidationError(null);
      upload.mutate(file);
    },
    [upload],
  );

  const handleClick = useCallback(() => {
    if (!upload.isPending) inputRef.current?.click();
  }, [upload.isPending]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
      // Reset so the same file can be re-selected after an error
      e.target.value = '';
    },
    [handleFile],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);
      if (upload.isPending) return;
      const file = e.dataTransfer.files?.[0];
      if (file) handleFile(file);
    },
    [upload.isPending, handleFile],
  );

  const error = validationError ?? (upload.isError ? String(upload.error) : null);

  return (
    <div className="flex flex-col gap-2">
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        onChange={handleChange}
        className="hidden"
        disabled={upload.isPending}
        aria-hidden
      />

      <button
        type="button"
        onClick={handleClick}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        disabled={upload.isPending}
        className={cn(
          'flex flex-col items-center justify-center gap-3',
          'min-h-[160px] w-full rounded-lg border-2 border-dashed p-6',
          'cursor-pointer transition-colors',
          'border-hairline bg-canvas text-ink-subtle',
          'hover:border-hairline-strong hover:bg-surface-1',
          isDragOver && 'border-primary-border bg-primary-tint text-ink',
          error && 'border-destructive/40 bg-destructive-tint',
          upload.isPending && 'cursor-wait opacity-60',
        )}
        aria-label="Upload knowledge file — click or drag and drop"
      >
        {upload.isPending ? (
          <>
            <Loader2 className="size-8 animate-spin text-ink-subtle" />
            <span className="text-body-sm text-ink-subtle">Uploading…</span>
          </>
        ) : (
          <>
            <Upload className="size-8 text-ink-tertiary" />
            <div className="flex flex-col items-center gap-1">
              <span className="text-body-sm font-medium text-ink">
                Drop a file or click to upload
              </span>
              <span className="text-eyebrow uppercase tracking-[0.04em] text-ink-subtle">
                PDF · DOCX · XLSX · CSV · TXT · MD &nbsp;·&nbsp; max 50 MB
              </span>
            </div>
          </>
        )}
      </button>

      {error && (
        <p role="alert" className="text-body-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
