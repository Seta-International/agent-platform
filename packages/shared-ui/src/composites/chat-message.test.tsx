import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ChatMessage } from './chat-message';

describe('<ChatMessage>', () => {
  it('renders a right-aligned bubble for user variant', () => {
    render(<ChatMessage variant="user">hi there</ChatMessage>);
    expect(screen.getByText('hi there')).toBeInTheDocument();
    const root = screen.getByText('hi there').closest('[data-variant]');
    expect(root?.getAttribute('data-variant')).toBe('user');
  });

  it('renders the agent name + avatar slot for agent variant', () => {
    render(
      <ChatMessage variant="agent" author="Supervisor" timestamp={new Date('2026-05-20T16:13:00Z')}>
        body
      </ChatMessage>,
    );
    expect(screen.getByText('Supervisor')).toBeInTheDocument();
    expect(screen.getByText('body')).toBeInTheDocument();
  });

  it('applies dim class when dim=true', () => {
    render(
      <ChatMessage variant="agent" dim>
        dim text
      </ChatMessage>,
    );
    const root = screen.getByText('dim text').closest('[data-variant]');
    expect(root?.className).toMatch(/opacity/);
  });
});
