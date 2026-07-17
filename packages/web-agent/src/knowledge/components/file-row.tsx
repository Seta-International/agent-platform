import { Badge, Button, cn } from '@seta/shared-ui';
import { FileText, Trash2 } from 'lucide-react';
import type { KnowledgeFile } from '../api/client';
import { useDeleteKnowledgeFile } from '../hooks/use-knowledge-files';

type StatusVariant = 'neutral' | 'success' | 'error';

interface StatusConfig {
  label: string;
  variant: StatusVariant;
}

const STATUS_CONFIG: Record<KnowledgeFile['status'], StatusConfig> = {
  uploading: { label: 'Uploading…', variant: 'neutral' },
  parsing: { label: 'Reading…', variant: 'neutral' },
  embedding: { label: 'Indexing…', variant: 'neutral' },
  ready: { label: 'Ready', variant: 'success' },
  failed: { label: "Couldn't process", variant: 'error' },
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface FileRowProps {
  file: KnowledgeFile;
}

export function FileRow({ file }: FileRowProps) {
  const deleteMutation = useDeleteKnowledgeFile();
  const config = STATUS_CONFIG[file.status];

  return (
    <li
      className={cn(
        'flex items-center gap-3 rounded-md border border-border bg-card px-4 py-3',
        deleteMutation.isPending && 'opacity-50',
      )}
    >
      <FileText className="size-5 shrink-0 text-disabled" aria-hidden />

      <div className="min-w-0 flex-1">
        <p className="truncate text-base font-medium text-primary">{file.filename}</p>
        <p className="text-xs font-medium text-secondary">{formatBytes(file.size_bytes)}</p>
        {file.status === 'failed' && file.error_reason && (
          <p className="mt-0.5 text-xs font-medium text-error">{file.error_reason}</p>
        )}
      </div>

      <Badge variant={config.variant} label={config.label} />

      <Button
        variant="ghost"
        size="sm"
        isIconOnly
        icon={<Trash2 className="size-4" aria-hidden />}
        label={`Delete ${file.filename}`}
        isDisabled={deleteMutation.isPending}
        onClick={() => deleteMutation.mutate(file.file_id)}
        className="shrink-0 text-secondary hover:text-error"
      />
    </li>
  );
}
