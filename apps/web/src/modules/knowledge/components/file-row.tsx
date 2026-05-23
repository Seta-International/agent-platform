import { Badge, Button, cn } from '@seta/shared-ui';
import { FileText, Trash2 } from 'lucide-react';
import type { KnowledgeFile } from '../api/client';
import { useDeleteKnowledgeFile } from '../hooks/use-knowledge-files';

type StatusVariant = 'default' | 'secondary' | 'success' | 'destructive';

interface StatusConfig {
  label: string;
  variant: StatusVariant;
}

const STATUS_CONFIG: Record<KnowledgeFile['status'], StatusConfig> = {
  uploading: { label: 'Uploading…', variant: 'secondary' },
  parsing: { label: 'Parsing…', variant: 'secondary' },
  embedding: { label: 'Indexing…', variant: 'secondary' },
  ready: { label: 'Ready', variant: 'success' },
  failed: { label: 'Failed', variant: 'destructive' },
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
        'flex items-center gap-3 rounded-md border border-hairline bg-surface-1 px-4 py-3',
        deleteMutation.isPending && 'opacity-50',
      )}
    >
      <FileText className="size-5 shrink-0 text-ink-tertiary" aria-hidden />

      <div className="min-w-0 flex-1">
        <p className="truncate text-body-sm font-medium text-ink">{file.filename}</p>
        <p className="text-eyebrow text-ink-subtle">{formatBytes(file.size_bytes)}</p>
        {file.status === 'failed' && file.error_reason && (
          <p className="mt-0.5 text-eyebrow text-destructive">{file.error_reason}</p>
        )}
      </div>

      <Badge variant={config.variant}>{config.label}</Badge>

      <Button
        variant="ghost"
        size="icon"
        aria-label={`Delete ${file.filename}`}
        disabled={deleteMutation.isPending}
        onClick={() => deleteMutation.mutate(file.file_id)}
        className="shrink-0 text-ink-subtle hover:text-destructive"
      >
        <Trash2 className="size-4" aria-hidden />
      </Button>
    </li>
  );
}
