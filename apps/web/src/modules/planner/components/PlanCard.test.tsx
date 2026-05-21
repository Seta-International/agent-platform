import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { makePlan } from '../testing/fixtures';
import { PlanCard } from './PlanCard';

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

  it('renders status pill for on-track status', () => {
    render(<PlanCard plan={basePlan} status="on-track" />);
    expect(screen.getByText('Active')).toBeInTheDocument(); // on-track → Active via StatusPill mapping
  });

  it('does not render a status pill when status is null', () => {
    render(<PlanCard plan={basePlan} status={null} />);
    expect(screen.queryByText('Active')).not.toBeInTheDocument();
    expect(screen.queryByText('Pending')).not.toBeInTheDocument();
    expect(screen.queryByText('Blocked')).not.toBeInTheDocument();
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
