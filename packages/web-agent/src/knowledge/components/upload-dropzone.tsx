import { FileInput } from '@seta/shared-ui';
import { useUploadKnowledgeFile } from '../hooks/use-knowledge-files';

const ACCEPT = '.pdf,.docx,.xlsx,.csv,.txt,.md';
const MAX_BYTES = 50 * 1024 * 1024;

export function UploadDropzone() {
  const upload = useUploadKnowledgeFile();
  return (
    <FileInput
      mode="dropzone"
      label="Upload knowledge file"
      accept={ACCEPT}
      maxSize={MAX_BYTES}
      value={null}
      onChange={(file) => {
        // Single-file mode: Astryx's onChange union always resolves to a bare
        // File (or null) here — isMultiple is unset — but the shared prop type
        // still spans File[] for the multi-select case.
        //
        // A new pick supersedes the last failure; otherwise a stale error
        // masks Astryx's own oversize message (status prop wins over its
        // internal validationError). Must run even when file is null — that's
        // the rejected-oversize path this fixes.
        if (upload.isError) upload.reset();
        if (file instanceof File) upload.mutate(file);
      }}
      isLoading={upload.isPending}
      isDisabled={upload.isPending}
      status={upload.isError ? { type: 'error', message: String(upload.error) } : undefined}
      placeholder="Drop a file here, or click to choose one"
      description="PDF · DOCX · XLSX · CSV · TXT · MD  ·  up to 50 MB"
    />
  );
}
