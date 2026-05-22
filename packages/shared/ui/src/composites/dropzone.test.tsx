import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Dropzone } from './dropzone';

describe('Dropzone', () => {
  it('renders the label and hint', () => {
    render(<Dropzone label="Drop here" hint="PDF · 50 MB" onFile={() => {}} />);
    expect(screen.getByText('Drop here')).toBeInTheDocument();
    expect(screen.getByText('PDF · 50 MB')).toBeInTheDocument();
  });

  it('shows the pending label and disables the trigger when isPending', () => {
    render(<Dropzone label="X" pendingLabel="Uploading…" isPending onFile={() => {}} />);
    expect(screen.getByText('Uploading…')).toBeInTheDocument();
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('rejects files over maxBytes with the configured message instead of calling onFile', () => {
    const onFile = vi.fn();
    const { container } = render(
      <Dropzone label="X" maxBytes={10} tooLargeMessage="Too big" onFile={onFile} />,
    );
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const big = new File(['hellohello!'], 'big.txt', { type: 'text/plain' });
    Object.defineProperty(input, 'files', { value: [big] });
    input.dispatchEvent(new Event('change', { bubbles: true }));
    expect(onFile).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Too big');
  });

  it('forwards a valid file to onFile', () => {
    const onFile = vi.fn();
    const { container } = render(<Dropzone label="X" maxBytes={1000} onFile={onFile} />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const small = new File(['hi'], 'small.txt', { type: 'text/plain' });
    Object.defineProperty(input, 'files', { value: [small] });
    input.dispatchEvent(new Event('change', { bubbles: true }));
    expect(onFile).toHaveBeenCalledWith(small);
  });

  it('renders an external error when provided', () => {
    render(<Dropzone label="X" error="Server failed" onFile={() => {}} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Server failed');
  });
});
