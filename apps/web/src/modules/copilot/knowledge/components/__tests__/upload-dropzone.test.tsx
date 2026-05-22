import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { knowledgeApi } from '../../api/client';
import { UploadDropzone } from '../upload-dropzone';

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

describe('UploadDropzone', () => {
  it('renders the drop prompt and accept hint', () => {
    render(wrap(<UploadDropzone />));
    expect(screen.getByText(/drop|upload/i)).toBeInTheDocument();
  });

  it('shows accepted file types hint', () => {
    render(wrap(<UploadDropzone />));
    // Hint includes recognized formats
    expect(screen.getByText(/pdf|docx|csv/i)).toBeInTheDocument();
  });

  it('shows size error when file exceeds 50 MB', async () => {
    vi.spyOn(knowledgeApi, 'requestUploadUrl').mockResolvedValue({
      file_id: 'f1',
      upload_url: 'https://s3.example.com/upload',
      s3_key: 'key/f1',
    });

    render(wrap(<UploadDropzone />));

    // Simulate drop of an oversized file via DataTransfer
    const dropzone = screen.getByRole('button');
    const bigFile = new File(['x'.repeat(1)], 'huge.pdf', { type: 'application/pdf' });
    Object.defineProperty(bigFile, 'size', { value: 51 * 1024 * 1024 });

    const dropEvent = new DragEvent('drop', { bubbles: true });
    Object.defineProperty(dropEvent, 'dataTransfer', {
      value: { files: [bigFile], items: [], types: [] },
    });
    dropzone.dispatchEvent(dropEvent);

    expect(await screen.findByText(/50 MB/i)).toBeInTheDocument();
  });
});
