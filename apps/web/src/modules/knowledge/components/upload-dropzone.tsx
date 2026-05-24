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
      label="Drop a file here, or click to choose one"
      hint="PDF · DOCX · XLSX · CSV · TXT · MD  ·  up to 50 MB"
      tooLargeMessage="That file is over 50 MB. Try a smaller one."
      isPending={upload.isPending}
      error={upload.isError ? String(upload.error) : null}
      onFile={(file) => upload.mutate(file)}
    />
  );
}
