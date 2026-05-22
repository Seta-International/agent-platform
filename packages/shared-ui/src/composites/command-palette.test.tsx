import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CommandPalette } from './command-palette';

describe('CommandPalette', () => {
  it('renders commands when open', () => {
    const run = vi.fn();
    render(
      <CommandPalette
        open
        onOpenChange={() => {}}
        commands={[
          { id: 'a', label: 'Alpha', onRun: run },
          { id: 'b', label: 'Beta', onRun: () => {} },
        ]}
      />,
    );
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Alpha'));
    expect(run).toHaveBeenCalled();
  });
});
