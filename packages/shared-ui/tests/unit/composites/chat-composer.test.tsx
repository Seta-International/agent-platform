import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { attachmentsBlockSend, ChatComposer } from '../../../src/composites/chat-composer';

describe('<ChatComposer>', () => {
  it('submits on Enter (not Shift+Enter)', () => {
    const onSubmit = vi.fn();
    render(
      <ChatComposer value="hi" onChange={() => undefined} onSubmit={onSubmit} placeholder="ask…" />,
    );
    const input = screen.getByPlaceholderText('ask…');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSubmit).toHaveBeenCalledOnce();
  });

  it('does not submit on Shift+Enter', () => {
    const onSubmit = vi.fn();
    render(<ChatComposer value="hi" onChange={() => undefined} onSubmit={onSubmit} />);
    const input = screen.getByRole('textbox');
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('disables submit when pending=true', () => {
    render(
      <ChatComposer value="hi" onChange={() => undefined} onSubmit={() => undefined} pending />,
    );
    // While pending the submit button swaps to a loading spinner labelled "Loading".
    expect(screen.getByRole('button', { name: /loading/i })).toBeDisabled();
  });
});

describe('attachmentsBlockSend', () => {
  it('blocks while any attachment is uploading or processing', () => {
    expect(attachmentsBlockSend([{ id: '1', filename: 'a', status: 'processing' }])).toBe(true);
    expect(attachmentsBlockSend([{ id: '1', filename: 'a', status: 'uploading' }])).toBe(true);
    expect(attachmentsBlockSend([{ id: '1', filename: 'a', status: 'ready' }])).toBe(false);
    expect(attachmentsBlockSend([])).toBe(false);
  });
});

describe('ChatComposer attachments', () => {
  it('disables send while an attachment is processing', () => {
    render(
      <ChatComposer
        value="hi"
        onChange={() => {}}
        onSubmit={vi.fn()}
        attachments={[{ id: '1', filename: 'spec.pdf', status: 'processing' }]}
      />,
    );
    const send = screen.getByLabelText('Send') as HTMLButtonElement;
    expect(send.disabled).toBe(true);
  });

  it('enables send when all attachments are ready and there is text', () => {
    render(
      <ChatComposer
        value="hi"
        onChange={() => {}}
        onSubmit={vi.fn()}
        attachments={[{ id: '1', filename: 'spec.pdf', status: 'ready' }]}
      />,
    );
    const send = screen.getByLabelText('Send') as HTMLButtonElement;
    expect(send.disabled).toBe(false);
  });

  it('renders a chip and fires onRemoveAttachment', () => {
    const onRemove = vi.fn();
    render(
      <ChatComposer
        value=""
        onChange={() => {}}
        onSubmit={() => {}}
        attachments={[{ id: '1', filename: 'spec.pdf', status: 'ready' }]}
        onRemoveAttachment={onRemove}
      />,
    );
    expect(screen.queryByText('spec.pdf')).not.toBeNull();
    fireEvent.click(screen.getByLabelText('Remove spec.pdf'));
    expect(onRemove).toHaveBeenCalledWith('1');
  });

  it('shows the attach button only when onAttachFiles is provided', () => {
    const { rerender } = render(<ChatComposer value="" onChange={() => {}} onSubmit={() => {}} />);
    expect(screen.queryByLabelText('Attach file')).toBeNull();
    rerender(
      <ChatComposer value="" onChange={() => {}} onSubmit={() => {}} onAttachFiles={vi.fn()} />,
    );
    expect(screen.queryByLabelText('Attach file')).not.toBeNull();
  });
});
