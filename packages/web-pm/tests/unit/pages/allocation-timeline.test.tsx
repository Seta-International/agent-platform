import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AllocationTimeline } from '../../../src/pages/allocation-timeline.tsx';

describe('AllocationTimeline', () => {
  it('renders a bar with the % label for each row and the month headers', () => {
    render(
      <AllocationTimeline
        rows={[
          {
            key: 'a1',
            label: 'Aeris - Watchtower',
            date_from: '2026-04-09',
            date_to: '2026-06-23',
            planned_pct: 30,
          },
        ]}
        todayIso="2026-05-01"
      />,
    );
    expect(screen.getByText('Aeris - Watchtower')).toBeTruthy();
    expect(screen.getAllByText('30%').length).toBeGreaterThan(0);
    expect(screen.getByText('Apr')).toBeTruthy();
    expect(screen.getByText('Jun')).toBeTruthy();
  });

  it('sums overlapping rows into the Total allocation row', () => {
    render(
      <AllocationTimeline
        rows={[
          {
            key: 'a1',
            label: 'Watchtower',
            date_from: '2026-06-01',
            date_to: '2026-12-31',
            planned_pct: 30,
          },
          {
            key: 'a2',
            label: 'Project X',
            date_from: '2026-06-01',
            date_to: '2026-12-31',
            planned_pct: 100,
          },
        ]}
        todayIso="2026-07-01"
      />,
    );
    expect(screen.getByText('Total allocation')).toBeTruthy();
    // The two rows overlap every month in range, so every month total is 130%.
    expect(screen.getAllByText('130%').length).toBeGreaterThan(0);
  });

  it('renders nothing when there are no rows', () => {
    const { container } = render(<AllocationTimeline rows={[]} todayIso="2026-07-01" />);
    expect(container.firstChild).toBeNull();
  });

  it('renders restricted rows with lock indicator and correctly sums into Total allocation', () => {
    render(
      <AllocationTimeline
        rows={[
          {
            key: 'a1',
            label: 'Sunwest',
            date_from: '2026-06-01',
            date_to: '2026-12-31',
            planned_pct: 100,
          },
          {
            key: 'r1',
            label: 'Restricted projects',
            date_from: '2026-06-01',
            date_to: '2026-12-31',
            planned_pct: 170,
            isRestricted: true,
          },
        ]}
        todayIso="2026-07-01"
      />,
    );
    expect(screen.getByText('Sunwest')).toBeTruthy();
    expect(screen.getByText('Restricted projects')).toBeTruthy();
    expect(screen.getByLabelText('Restricted')).toBeTruthy();
    expect(screen.getAllByText('270%').length).toBeGreaterThan(0);
  });
});
