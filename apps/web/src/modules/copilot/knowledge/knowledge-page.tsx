import { EmptyState, PageChrome, Skeleton } from '@seta/shared-ui';
import { BookOpen } from 'lucide-react';
import { FileRow } from './components/file-row';
import { UploadDropzone } from './components/upload-dropzone';
import { useKnowledgeFileStream } from './hooks/use-knowledge-file-stream';
import { useKnowledgeFiles } from './hooks/use-knowledge-files';

export function KnowledgePage() {
  useKnowledgeFileStream();

  const { data: files, isPending } = useKnowledgeFiles();

  return (
    <PageChrome
      title="Company knowledge"
      subtitle="Upload handbooks, policies, and processes the copilot can cite"
      breadcrumb={['Copilot', 'Knowledge']}
    >
      <div className="px-6 py-6 space-y-6">
        <UploadDropzone />

        <section className="space-y-2">
          <h2 className="text-eyebrow uppercase tracking-[0.04em] text-ink-subtle">Files</h2>

          {isPending ? (
            <div className="space-y-2">
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </div>
          ) : files?.length === 0 ? (
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
        </section>
      </div>
    </PageChrome>
  );
}
