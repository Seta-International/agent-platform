import { EmptyState, PageChrome, Skeleton } from '@seta/shared-ui';
import { BookOpen } from 'lucide-react';
import { FileRow } from './components/file-row';
import { UploadDropzone } from './components/upload-dropzone';
import { useKnowledgeFileStream } from './hooks/use-knowledge-file-stream';
import { useKnowledgeFiles } from './hooks/use-knowledge-files';

export function KnowledgePage() {
  useKnowledgeFileStream();

  const { data: files, isPending } = useKnowledgeFiles();
  const fileCount = files?.length ?? 0;
  const subtitle = isPending
    ? undefined
    : fileCount === 0
      ? 'No files yet'
      : `${fileCount} ${fileCount === 1 ? 'file' : 'files'}`;

  return (
    <PageChrome breadcrumb={['Copilot']} title="Knowledge" subtitle={subtitle}>
      <div className="bg-surface-1 px-4 py-6 pb-10 sm:px-6 min-h-full">
        <div className="mx-auto flex max-w-3xl flex-col gap-6">
          <UploadDropzone />

          {isPending ? (
            <div className="space-y-2">
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </div>
          ) : fileCount === 0 ? (
            <EmptyState
              icon={<BookOpen className="size-10" />}
              title="No files uploaded yet"
              description="Drag and drop or click above to upload your first document."
            />
          ) : (
            <ul className="space-y-2">
              {files?.map((f) => (
                <FileRow key={f.file_id} file={f} />
              ))}
            </ul>
          )}
        </div>
      </div>
    </PageChrome>
  );
}
