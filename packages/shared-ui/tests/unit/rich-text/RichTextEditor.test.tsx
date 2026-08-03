// @ts-nocheck
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RichTextEditor } from '../../../src/rich-text/RichTextEditor';

describe('RichTextEditor', () => {
  it('synchronizes content when value prop changes externally (e.g. on reset)', async () => {
    const { rerender } = render(<RichTextEditor value="Initial content" onChange={() => {}} />);
    expect(screen.getByText('Initial content')).toBeInTheDocument();

    rerender(<RichTextEditor value="" onChange={() => {}} />);
    expect(screen.queryByText('Initial content')).not.toBeInTheDocument();
  });
});
