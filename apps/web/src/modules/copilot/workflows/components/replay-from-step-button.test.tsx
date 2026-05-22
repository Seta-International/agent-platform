import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ReplayFromStepButton } from './replay-from-step-button.tsx';

describe('ReplayFromStepButton', () => {
  it('does not render when the run is still running', () => {
    render(
      <ReplayFromStepButton
        runStatus="running"
        stepStatus="success"
        stepId="b"
        originalPayload={{}}
        onReplay={vi.fn()}
      />,
    );
    expect(screen.queryByRole('button', { name: /replay/i })).not.toBeInTheDocument();
  });

  it('does not render when the step is still pending', () => {
    render(
      <ReplayFromStepButton
        runStatus="success"
        stepStatus="pending"
        stepId="b"
        originalPayload={{}}
        onReplay={vi.fn()}
      />,
    );
    expect(screen.queryByRole('button', { name: /replay/i })).not.toBeInTheDocument();
  });

  it('renders for completed step on terminal run and calls onReplay with stepId + payload', () => {
    const onReplay = vi.fn();
    render(
      <ReplayFromStepButton
        runStatus="failed"
        stepStatus="success"
        stepId="b"
        originalPayload={{ x: 1 }}
        onReplay={onReplay}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /replay from here/i }));
    expect(onReplay).toHaveBeenCalledWith({ stepId: 'b', originalPayload: { x: 1 } });
  });
});
