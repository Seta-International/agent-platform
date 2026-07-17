import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToggleButton, ToggleButtonGroup } from '../../../src/primitives/toggle-button';

describe('ToggleButton / ToggleButtonGroup', () => {
  it('renders a labeled group and toggles selection via onChange (single mode)', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <ToggleButtonGroup label="Lane" value="general" onChange={onChange}>
        <ToggleButton value="general" label="General" />
        <ToggleButton value="planner" label="Planner" />
      </ToggleButtonGroup>,
    );
    expect(screen.getByRole('group', { name: 'Lane' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Planner' }));
    expect(onChange).toHaveBeenCalledWith('planner');
  });
});
