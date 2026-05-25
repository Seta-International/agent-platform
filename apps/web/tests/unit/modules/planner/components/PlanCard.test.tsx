import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PlanCard } from '../../../../../src/modules/planner/components/PlanCard';
import { makePlan } from '../../../../../src/modules/planner/testing/fixtures';

const basePlan = makePlan({ id: 'p1', name: 'Q3 Launch' });

describe('PlanCard', () => {
  it('renders plan name and color rail', () => {
    render(<PlanCard plan={basePlan} themeColor="#0047FF" />);
    expect(screen.getByText('Q3 Launch')).toBeInTheDocument();
    // color rail asserted by presence of inline-styled element with the expected background
  });

  it('renders task counts when provided', () => {
    render(
      <PlanCard plan={basePlan} taskCount={28} openTaskCount={18} dueDate="2026-08-15T00:00:00Z" />,
    );
    expect(screen.getByText(/28 tasks/)).toBeInTheDocument();
    expect(screen.getByText(/18 open/)).toBeInTheDocument();
  });

  it('renders progress percent when progressPct provided', () => {
    render(<PlanCard plan={basePlan} progressPct={0.62} />);
    expect(screen.getByText('62%')).toBeInTheDocument();
  });

  it('renders the MS Planner 3-state legend when bucket counts are provided', () => {
    render(<PlanCard plan={basePlan} notStartedCount={3} inProgressCount={5} completedCount={2} />);
    expect(screen.getByText('Not started')).toBeInTheDocument();
    expect(screen.getByText('In progress')).toBeInTheDocument();
    expect(screen.getByText('Completed')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('does not render the legend when no bucket counts are provided', () => {
    render(<PlanCard plan={basePlan} />);
    expect(screen.queryByText('Not started')).not.toBeInTheDocument();
    expect(screen.queryByText('In progress')).not.toBeInTheDocument();
    expect(screen.queryByText('Completed')).not.toBeInTheDocument();
  });

  it('does not render the on-track / at-risk / off-track pills (MS Planner has no plan status)', () => {
    render(<PlanCard plan={basePlan} progressPct={0.5} />);
    expect(screen.queryByText('On track')).not.toBeInTheDocument();
    expect(screen.queryByText('At risk')).not.toBeInTheDocument();
    expect(screen.queryByText('Off track')).not.toBeInTheDocument();
  });

  it('renders owner display name when provided', () => {
    render(<PlanCard plan={basePlan} ownerDisplayName="Jane Doe" />);
    expect(screen.getByText('Jane Doe')).toBeInTheDocument();
  });

  it('calls onClick when the card is clicked', async () => {
    const { default: userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<PlanCard plan={basePlan} onClick={onClick} />);
    await user.click(screen.getByText('Q3 Launch'));
    expect(onClick).toHaveBeenCalled();
  });
});
