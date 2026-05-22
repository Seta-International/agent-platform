import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { DerivedTaskStatus } from '../../lib/derive-task-status';
import { StatusInline } from './status-inline';

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
