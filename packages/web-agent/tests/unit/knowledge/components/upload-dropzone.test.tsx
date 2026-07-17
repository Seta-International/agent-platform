import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { knowledgeApi } from '../../../../src/knowledge/api/client';
import { UploadDropzone } from '../../../../src/knowledge/components/upload-dropzone';

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

describe('UploadDropzone', () => {
  it('renders the drop prompt and accept hint', () => {
    render(wrap(<UploadDropzone />));
    expect(screen.getByText('Drop a file here, or click to choose one')).toBeInTheDocument();
    // Hint includes recognized formats
    expect(screen.getByText(/pdf.*docx.*csv/i)).toBeInTheDocument();
  });

  it('uploads the picked file', async () => {
    vi.spyOn(knowledgeApi, 'requestUploadUrl').mockResolvedValue({
      file_id: 'f1',
      upload_url: 'https://s3.example.com/upload',
      s3_key: 'key/f1',
    });
    vi.spyOn(knowledgeApi, 'putToS3').mockResolvedValue(undefined);
    vi.spyOn(knowledgeApi, 'markProcessed').mockResolvedValue(undefined);

    render(wrap(<UploadDropzone />));

    // The visible dropzone proxies a real <input type="file"> — find it via the
    // (visually hidden) accessible label and change it, per FileInput's pinned contract.
    const input = screen.getByLabelText('Upload knowledge file', { selector: 'input' });
    const file = new File(['x'], 'notes.pdf', { type: 'application/pdf' });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() =>
      expect(knowledgeApi.requestUploadUrl).toHaveBeenCalledWith(
        expect.objectContaining({ filename: 'notes.pdf' }),
      ),
    );
  });

  it('shows a size error for a file over 50 MB', () => {
    render(wrap(<UploadDropzone />));

    const input = screen.getByLabelText('Upload knowledge file', { selector: 'input' });
    const bigFile = new File(['x'], 'huge.pdf', { type: 'application/pdf' });
    Object.defineProperty(bigFile, 'size', { value: 51 * 1024 * 1024 });
    fireEvent.change(input, { target: { files: [bigFile] } });

    // Astryx's FileInput renders its own over-maxSize error natively (spec'd drift —
    // the old composite's custom "over 50 MB" copy is gone). Scope to the field-status
    // node: the same message is also mirrored into an aria-live="polite" announcer.
    expect(
      screen.getByText('"huge.pdf" exceeds 50.0 MB limit', { selector: '[data-type="error"]' }),
    ).toBeInTheDocument();
  });
});
