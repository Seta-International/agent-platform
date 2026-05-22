import { Dropzone } from '@seta/shared-ui';
import { useUploadKnowledgeFile } from '../hooks/use-knowledge-files';

const ACCEPT = '.pdf,.docx,.xlsx,.csv,.txt,.md';
const MAX_BYTES = 50 * 1024 * 1024;

export function UploadDropzone() {
  const upload = useUploadKnowledgeFile();
  return (
    <Dropzone
      accept={ACCEPT}
      maxBytes={MAX_BYTES}
      label="Drop a file or click to upload"
      hint="PDF · DOCX · XLSX · CSV · TXT · MD  ·  max 50 MB"
      tooLargeMessage="File exceeds the 50 MB limit. Please choose a smaller file."
      isPending={upload.isPending}
      error={upload.isError ? String(upload.error) : null}
      onFile={(file) => upload.mutate(file)}
    />
  );
}
