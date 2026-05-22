import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ChatTranscript } from './chat-transcript';

describe('<ChatTranscript>', () => {
  it('renders children in a scroll container with max-width', () => {
    render(
      <ChatTranscript>
        <div>m1</div>
        <div>m2</div>
      </ChatTranscript>,
    );
    expect(screen.getByText('m1')).toBeInTheDocument();
    expect(screen.getByText('m2')).toBeInTheDocument();
    const root = screen.getByTestId('chat-transcript');
    expect(root.className).toMatch(/overflow-auto/);
  });

  it('renders a date divider when provided', () => {
    render(<ChatTranscript dateDividers={[{ label: 'Yesterday at 16:12' }]}>...</ChatTranscript>);
    expect(screen.getByText(/Yesterday at 16:12/)).toBeInTheDocument();
  });
});
