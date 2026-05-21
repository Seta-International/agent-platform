import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PREVIEW_TYPES, PreviewTypeRadio } from './preview-type-radio';

describe('PreviewTypeRadio', () => {
  it('renders 5 options in spec order', () => {
    render(<PreviewTypeRadio value="automatic" onChange={() => {}} />);
    expect(PREVIEW_TYPES.map((o) => o.value)).toEqual([
      'automatic',
      'noPreview',
      'checklist',
      'description',
      'reference',
    ]);
    expect(screen.getAllByRole('radio')).toHaveLength(5);
  });
  it('marks the matching value aria-checked=true', () => {
    render(<PreviewTypeRadio value="description" onChange={() => {}} />);
    expect(screen.getByRole('radio', { name: /Description/ })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });
  it('calls onChange with the new variant on click', () => {
    const onChange = vi.fn();
    render(<PreviewTypeRadio value="automatic" onChange={onChange} />);
    fireEvent.click(screen.getByRole('radio', { name: /Reference/ }));
    expect(onChange).toHaveBeenCalledWith('reference');
  });
});
