import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { makePlan } from '../testing/fixtures';
import { GroupPlansSection } from './GroupPlansSection';

const baseProps = {
  groupName: 'Engineering',
  plans: [makePlan({ id: 'p1', name: 'Q3 Launch' }), makePlan({ id: 'p2', name: 'Refresh' })],
  themeColor: '#0047FF',
  canCreatePlan: true,
  onCreatePlan: vi.fn(),
  onPlanClick: vi.fn(),
};

describe('GroupPlansSection', () => {
  it('renders one PlanCard per plan', () => {
    render(<GroupPlansSection {...baseProps} />);
    expect(screen.getByText('Q3 Launch')).toBeInTheDocument();
    expect(screen.getByText('Refresh')).toBeInTheDocument();
  });

  it('renders dashed "Create a plan in {name}" tile when canCreatePlan=true', () => {
    render(<GroupPlansSection {...baseProps} />);
    expect(screen.getByText(/Create a plan in Engineering/)).toBeInTheDocument();
  });

  it('hides the dashed tile when canCreatePlan=false', () => {
    render(<GroupPlansSection {...baseProps} canCreatePlan={false} />);
    expect(screen.queryByText(/Create a plan in/)).not.toBeInTheDocument();
  });

  it('calls onCreatePlan when the dashed tile is clicked', async () => {
    const user = userEvent.setup();
    const onCreatePlan = vi.fn();
    render(<GroupPlansSection {...baseProps} onCreatePlan={onCreatePlan} />);
    await user.click(screen.getByText(/Create a plan in Engineering/));
    expect(onCreatePlan).toHaveBeenCalled();
  });

  it('calls onPlanClick(planId) when a card is clicked', async () => {
    const user = userEvent.setup();
    const onPlanClick = vi.fn();
    render(<GroupPlansSection {...baseProps} onPlanClick={onPlanClick} />);
    await user.click(screen.getByText('Q3 Launch'));
    expect(onPlanClick).toHaveBeenCalledWith('p1');
  });

  it('renders empty when plans is empty and canCreatePlan=false', () => {
    const { container } = render(
      <GroupPlansSection {...baseProps} plans={[]} canCreatePlan={false} />,
    );
    expect(container.querySelector('a, button')).toBeNull(); // nothing clickable
  });
});
