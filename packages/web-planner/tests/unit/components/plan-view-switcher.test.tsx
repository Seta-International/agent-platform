import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PlanViewSwitcher } from '../../../src/components/plan-view-switcher';

describe('PlanViewSwitcher', () => {
  it('exposes the four views as a radiogroup with the active view checked', () => {
    render(<PlanViewSwitcher value="grid" onChange={vi.fn()} />);

    expect(screen.getByRole('radiogroup', { name: 'View mode' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Grid' })).toBeChecked();
    for (const name of ['Board', 'Calendar', 'Charts']) {
      expect(screen.getByRole('radio', { name })).not.toBeChecked();
    }
  });

  it('reports the picked view', () => {
    const onChange = vi.fn();
    render(<PlanViewSwitcher value="board" onChange={onChange} />);

    fireEvent.click(screen.getByRole('radio', { name: 'Charts' }));
    expect(onChange).toHaveBeenCalledWith('charts');
  });
});
