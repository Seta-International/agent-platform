import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatusInline } from '../../../../src/components/my-tasks/status-inline';
import type { DerivedTaskStatus } from '../../../../src/lib/derive-task-status';

describe('StatusInline', () => {
  it.each<[DerivedTaskStatus, string]>([
    ['Not started', 'neutral'],
    ['In Progress', 'accent'],
    ['Done', 'success'],
    ['Deferred', 'neutral'],
  ])('renders %s with status-dot tone %s', (status, expectedTone) => {
    render(<StatusInline status={status} />);
    const dot = screen.getByTestId('status-inline-dot');
    expect(dot.getAttribute('data-tone')).toBe(expectedTone);
    expect(screen.getByText(status)).toBeInTheDocument();
  });
});
