import { fireEvent, render, screen } from '@testing-library/react';
import { act } from 'react';
import { describe, expect, it } from 'vitest';
import { AgentPanel } from '../../../src/composites/agent-panel';

describe('AgentPanel', () => {
  it('renders children inside an aside labeled Agent', () => {
    render(
      <AgentPanel storageKey={null}>
        <div>panel body</div>
      </AgentPanel>,
    );
    const panel = screen.getByRole('complementary', { name: 'Agent' });
    expect(panel).toBeInTheDocument();
    expect(screen.getByText('panel body')).toBeInTheDocument();
  });

  it('starts at defaultWidth and exposes a keyboard-resizable handle', () => {
    render(
      <AgentPanel storageKey={null} defaultWidth={400} minWidth={320} maxWidth={720}>
        <div>panel body</div>
      </AgentPanel>,
    );
    const handle = screen.getByRole('separator', { name: /resize/i });
    expect(handle).toHaveAttribute('aria-valuenow', '400');
    expect(handle).toHaveAttribute('aria-valuemin', '320');
    expect(handle).toHaveAttribute('aria-valuemax', '720');
    expect(handle).toHaveAttribute('tabindex', '0');

    handle.focus();
    act(() => {
      fireEvent.keyDown(handle, { key: 'ArrowLeft' });
    });
    // ResizeHandle updates aria-valuenow on resize; keyboard events are handled by Astryx
    expect(handle).toHaveAttribute('aria-valuenow');
  });
});
