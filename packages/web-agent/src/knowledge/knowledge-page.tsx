import {
  BreadcrumbItem,
  Breadcrumbs,
  EmptyState,
  HStack,
  Layout,
  LayoutContent,
  LayoutHeader,
  Skeleton,
  Text,
  VStack,
} from '@seta/shared-ui';
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
    <Layout
      height="fill"
      header={
        <LayoutHeader hasDivider padding={4}>
          <VStack gap={1}>
            <Breadcrumbs variant="supporting">
              <BreadcrumbItem href="/agent">Agent Studio</BreadcrumbItem>
              <BreadcrumbItem isCurrent>Knowledge</BreadcrumbItem>
            </Breadcrumbs>
            <HStack gap={2} vAlign="center">
              <Text as="h1" size="lg" weight="semibold">
                Knowledge
              </Text>
              {subtitle && <Text color="secondary">{subtitle}</Text>}
            </HStack>
          </VStack>
        </LayoutHeader>
      }
      content={
        <LayoutContent padding={0}>
          <div className="bg-surface-1 px-4 py-6 pb-10 sm:px-6 min-h-full">
            <div className="mx-auto flex max-w-3xl flex-col gap-6">
              <UploadDropzone />

              {isPending ? (
                <div className="space-y-2">
                  <Skeleton height={56} />
                  <Skeleton height={56} />
                  <Skeleton height={56} />
                </div>
              ) : fileCount === 0 ? (
                <EmptyState
                  icon={<BookOpen className="size-10" />}
                  title="Nothing here yet"
                  description="Drop a document above to start building your knowledge base."
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
        </LayoutContent>
      }
    />
  );
}
