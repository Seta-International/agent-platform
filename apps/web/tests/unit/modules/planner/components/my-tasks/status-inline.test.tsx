import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatusInline } from '../../../../../../src/modules/planner/components/my-tasks/status-inline';
import type { DerivedTaskStatus } from '../../../../../../src/modules/planner/lib/derive-task-status';

describe('StatusInline', () => {
  it.each<[DerivedTaskStatus, string]>([
    ['Not started', 'dot--muted'],
    ['In Progress', 'dot--primary'],
    ['Done', 'dot--success'],
    ['Deferred', 'dot--muted'],
  ])('renders %s with class %s', (status, expectedClass) => {
    render(<StatusInline status={status} />);
    const dot = screen.getByTestId('status-inline-dot');
    expect(dot.className).toContain('dot');
    expect(dot.className).toContain(expectedClass);
    expect(screen.getByText(status)).toBeInTheDocument();
  });
});
