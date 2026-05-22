import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ChatHitlCard } from './chat-hitl-card';

describe('<ChatHitlCard>', () => {
  it('renders title, tool name, and expiry countdown', () => {
    const future = new Date(Date.now() + 5 * 60_000);
    render(
      <ChatHitlCard
        title="Change display name"
        toolName="identity.updateMyDisplayName"
        expiresAt={future}
        onApprove={() => undefined}
        onReject={() => undefined}
      >
        <div>diff slot</div>
      </ChatHitlCard>,
    );
    expect(screen.getByText('Change display name')).toBeInTheDocument();
    expect(screen.getByText('identity.updateMyDisplayName')).toBeInTheDocument();
    expect(screen.getByText(/expires in/i)).toBeInTheDocument();
    expect(screen.getByText('diff slot')).toBeInTheDocument();
  });

  it('calls onApprove and onReject', () => {
    const onApprove = vi.fn();
    const onReject = vi.fn();
    render(
      <ChatHitlCard
        title="t"
        toolName="t.t"
        expiresAt={new Date(Date.now() + 60_000)}
        onApprove={onApprove}
        onReject={onReject}
      >
        <div />
      </ChatHitlCard>,
    );
    fireEvent.click(screen.getByRole('button', { name: /approve/i }));
    fireEvent.click(screen.getByRole('button', { name: /reject/i }));
    expect(onApprove).toHaveBeenCalledOnce();
    expect(onReject).toHaveBeenCalledOnce();
  });

  it('disables Approve when expired', () => {
    render(
      <ChatHitlCard
        title="t"
        toolName="t.t"
        expiresAt={new Date(Date.now() - 1_000)}
        onApprove={() => undefined}
        onReject={() => undefined}
      >
        <div />
      </ChatHitlCard>,
    );
    expect(screen.getByRole('button', { name: /approve/i })).toBeDisabled();
  });
});
