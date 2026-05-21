import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AddReferenceCombobox } from './add-reference-combobox';

describe('AddReferenceCombobox', () => {
  it('detects URL paste and calls onAdd with parsed type/host', () => {
    const onAdd = vi.fn();
    render(<AddReferenceCombobox onAdd={onAdd} />);
    const input = screen.getByPlaceholderText(/Paste a URL/i);
    fireEvent.change(input, {
      target: { value: 'https://acme.sharepoint.com/Shared/Doc.xlsx' },
    });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://acme.sharepoint.com/Shared/Doc.xlsx',
        type: 'excel',
        alias: 'Doc.xlsx',
      }),
    );
  });
  it('infers type=word for .docx, =powerPoint for .pptx, =web otherwise', () => {
    const onAdd = vi.fn();
    render(<AddReferenceCombobox onAdd={onAdd} />);
    const input = screen.getByPlaceholderText(/Paste a URL/i);
    for (const [url, type] of [
      ['https://x/y.docx', 'word'],
      ['https://x/y.pptx', 'powerPoint'],
      ['https://x/y', 'web'],
    ] as const) {
      fireEvent.change(input, { target: { value: url } });
      fireEvent.keyDown(input, { key: 'Enter' });
      expect(onAdd).toHaveBeenLastCalledWith(expect.objectContaining({ type }));
    }
  });
  it('classifies extensionless SharePoint URLs as type=sharePoint', () => {
    const onAdd = vi.fn();
    render(<AddReferenceCombobox onAdd={onAdd} />);
    const input = screen.getByPlaceholderText(/Paste a URL/i);
    fireEvent.change(input, {
      target: { value: 'https://acme.sharepoint.com/sites/Engineering' },
    });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://acme.sharepoint.com/sites/Engineering',
        type: 'sharePoint',
      }),
    );
  });
  it('does not call onAdd when input is not a URL', () => {
    const onAdd = vi.fn();
    render(<AddReferenceCombobox onAdd={onAdd} />);
    fireEvent.change(screen.getByPlaceholderText(/Paste a URL/i), {
      target: { value: 'not a url' },
    });
    fireEvent.keyDown(screen.getByPlaceholderText(/Paste a URL/i), { key: 'Enter' });
    expect(onAdd).not.toHaveBeenCalled();
  });
});
