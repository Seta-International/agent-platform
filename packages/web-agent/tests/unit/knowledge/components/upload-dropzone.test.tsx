import { FileInput } from '@seta/shared-ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { knowledgeApi } from '../../../../src/knowledge/api/client';
import { UploadDropzone } from '../../../../src/knowledge/components/upload-dropzone';

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

// Astryx's FieldLabel applies sr-only styling to `description` too whenever
// `isLabelHidden` is set on the field (see @astryxdesign/core FieldLabel.tsx) — the
// original regression this suite must catch. `screen.getByText` can't see that: it
// only asserts DOM presence, not the sr-only clip/1px-box treatment layered on top by
// StyleX classes. Derive the exact "sr-only extra" class signature at test time (rather
// than hardcoding StyleX's atomic hashes) by diffing a known-hidden field's description
// classes against a known-visible one, then assert the real hint carries none of them.
function srOnlyExtraClasses(): Set<string> {
  const { container: hidden } = render(
    <FileInput
      label="probe"
      isLabelHidden
      description="probe-description"
      value={null}
      onChange={() => {}}
    />,
  );
  const { container: visible } = render(
    <FileInput label="probe" description="probe-description" value={null} onChange={() => {}} />,
  );
  const hiddenDesc = Array.from(hidden.querySelectorAll('span')).find(
    (el) => el.textContent === 'probe-description',
  );
  const visibleDesc = Array.from(visible.querySelectorAll('span')).find(
    (el) => el.textContent === 'probe-description',
  );
  const hiddenSet = new Set((hiddenDesc?.className ?? '').split(' '));
  const visibleSet = new Set((visibleDesc?.className ?? '').split(' '));
  return new Set([...hiddenSet].filter((c) => !visibleSet.has(c)));
}

describe('UploadDropzone', () => {
  it('renders the drop prompt and accept hint', () => {
    render(wrap(<UploadDropzone />));
    expect(screen.getByText('Drop a file here, or click to choose one')).toBeInTheDocument();
    // Hint includes recognized formats
    expect(screen.getByText(/pdf.*docx.*csv/i)).toBeInTheDocument();
  });

  it('renders the accept/size hint visibly, not screen-reader-only', () => {
    render(wrap(<UploadDropzone />));
    const hint = screen.getByText(/pdf.*docx.*csv/i);
    const extra = srOnlyExtraClasses();
    expect(extra.size).toBeGreaterThan(0); // sanity: the probe actually detects a difference
    const hintClasses = new Set(hint.className.split(' '));
    const leaked = [...extra].filter((c) => hintClasses.has(c));
    expect(leaked).toEqual([]);
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

  it('clears a stale upload error so a later oversize pick reports its own message', async () => {
    // A caller-supplied `status` wins over Astryx's internal validation error
    // (FileInput.tsx: `statusProp ?? validationError`). Before the fix, this
    // site keeps passing the failed-upload status forever, so a later oversize
    // drop is silently rejected by Astryx (onChange(null)) while the stale
    // "Upload failed" message stays on screen instead of the real oversize one.
    vi.spyOn(knowledgeApi, 'requestUploadUrl').mockRejectedValue(new Error('Upload failed'));

    render(wrap(<UploadDropzone />));

    const input = screen.getByLabelText('Upload knowledge file', { selector: 'input' });
    const file = new File(['x'], 'notes.pdf', { type: 'application/pdf' });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() =>
      expect(
        screen.getByText('Error: Upload failed', { selector: '[data-type="error"]' }),
      ).toBeInTheDocument(),
    );

    const bigFile = new File(['x'], 'huge.pdf', { type: 'application/pdf' });
    Object.defineProperty(bigFile, 'size', { value: 51 * 1024 * 1024 });
    fireEvent.change(input, { target: { files: [bigFile] } });

    await waitFor(() =>
      expect(
        screen.getByText('"huge.pdf" exceeds 50.0 MB limit', { selector: '[data-type="error"]' }),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByText('Error: Upload failed')).not.toBeInTheDocument();
  });
});
