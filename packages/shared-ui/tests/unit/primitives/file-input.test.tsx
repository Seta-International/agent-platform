import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FileInput } from '../../../src/primitives/file-input';

describe('FileInput dropzone (Astryx contract under happy-dom)', () => {
  it('fires onChange with the picked file', () => {
    const onChange = vi.fn();
    render(
      <FileInput
        mode="dropzone"
        label="Upload file"
        value={null}
        onChange={onChange}
        accept=".pdf"
      />,
    );
    const file = new File(['x'], 'a.pdf', { type: 'application/pdf' });
    // The visible dropzone proxies a real <input type="file"> — find it and change it.
    const input = screen.getByLabelText('Upload file', { selector: 'input' });
    fireEvent.change(input, { target: { files: [file] } });
    expect(onChange).toHaveBeenCalledTimes(1);
    // PINNED: single-file mode (isMultiple unset) resolves onChange to the bare
    // File, not a File[] — Astryx only wraps in an array when isMultiple is true.
    expect(onChange.mock.calls[0]![0]).toBe(file);
  });

  it('shows the error status message', () => {
    render(
      <FileInput
        mode="dropzone"
        label="Upload file"
        value={null}
        onChange={() => {}}
        status={{ type: 'error', message: 'Upload failed' }}
      />,
    );
    expect(screen.getByText('Upload failed')).toBeInTheDocument();
  });
});
