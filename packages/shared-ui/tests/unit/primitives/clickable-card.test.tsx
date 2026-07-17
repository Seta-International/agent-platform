import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ClickableCard } from '../../../src/primitives/clickable-card';

describe('ClickableCard', () => {
  it('renders children and exposes an accessible name from label', () => {
    render(<ClickableCard label="Open settings">Settings</ClickableCard>);
    expect(screen.getByText('Settings')).toBeInTheDocument();
    // PINNED: the accessible role + name come from a hidden <button>/<a>,
    // not the card <div> — assert the role, not the surface.
    expect(screen.getByRole('button', { name: 'Open settings' })).toBeInTheDocument();
  });

  it('fires onClick when activated', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <ClickableCard label="Open settings" onClick={onClick}>
        Settings
      </ClickableCard>,
    );
    await user.click(screen.getByRole('button', { name: 'Open settings' }));
    expect(onClick).toHaveBeenCalled();
  });
});
