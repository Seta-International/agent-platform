import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ChatComposer } from '../../../src/composites/chat-composer';

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
