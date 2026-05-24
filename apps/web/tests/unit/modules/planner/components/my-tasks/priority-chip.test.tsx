import type { TaskPriorityNumber } from '@seta/planner';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PriorityChip } from '../../../../../../src/modules/planner/components/my-tasks/priority-chip';

describe('PriorityChip', () => {
  it.each<[TaskPriorityNumber, string]>([
    [1, 'Urgent'],
    [3, 'Important'],
    [5, 'Medium'],
    [9, 'Low'],
  ])('renders label for prio %i → %s', (prio, label) => {
    render(<PriorityChip prio={prio} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it('falls back to Medium for an unmapped prio', () => {
    // bypass the TS narrowing for the fallback case — mockup line 321 has the `|| ...` fallback
    render(<PriorityChip prio={7 as unknown as TaskPriorityNumber} />);
    expect(screen.getByText('Medium')).toBeInTheDocument();
  });
});
