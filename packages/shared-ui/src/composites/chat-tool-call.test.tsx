import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ChatToolCall } from './chat-tool-call';

describe('<ChatToolCall>', () => {
  it('renders name, summary, duration, and the ok status dot', () => {
    render(<ChatToolCall name="identity.whoAmI" status="ok" summary="ran" duration="8ms" />);
    expect(screen.getByText('identity.whoAmI')).toBeInTheDocument();
    expect(screen.getByText('ran')).toBeInTheDocument();
    expect(screen.getByText('8ms')).toBeInTheDocument();
  });

  it('renders the error variant', () => {
    render(<ChatToolCall name="x" status="error" summary="boom" />);
    expect(screen.getByText('boom')).toBeInTheDocument();
    expect(screen.getByText('x').closest('[data-status]')?.getAttribute('data-status')).toBe(
      'error',
    );
  });

  it('toggles the expanded payload', () => {
    render(<ChatToolCall name="x" status="ok" summary="ran" payload={{ k: 'v' }} />);
    const trigger = screen.getByText('x');
    fireEvent.click(trigger);
    expect(screen.getByText(/"k"/)).toBeInTheDocument();
  });
});
