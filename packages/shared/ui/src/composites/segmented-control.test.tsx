import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SegmentedControl } from './segmented-control';

const opts = [
  { value: 'list' as const, label: 'List' },
  { value: 'grid' as const, label: 'Grid' },
];

describe('SegmentedControl', () => {
  it('renders a tablist with each option as a tab', () => {
    render(<SegmentedControl value="list" onValueChange={() => {}} options={opts} />);
    const tablist = screen.getByRole('tablist');
    expect(tablist).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'List' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Grid' })).toBeInTheDocument();
  });

  it('marks the active tab with aria-selected="true"', () => {
    render(<SegmentedControl value="grid" onValueChange={() => {}} options={opts} />);
    expect(screen.getByRole('tab', { name: 'List' })).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByRole('tab', { name: 'Grid' })).toHaveAttribute('aria-selected', 'true');
  });

  it('calls onValueChange when an inactive tab is clicked', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<SegmentedControl value="list" onValueChange={onValueChange} options={opts} />);
    await user.click(screen.getByRole('tab', { name: 'Grid' }));
    expect(onValueChange).toHaveBeenCalledWith('grid');
  });

  it('does not call onValueChange when the active tab is clicked', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<SegmentedControl value="list" onValueChange={onValueChange} options={opts} />);
    await user.click(screen.getByRole('tab', { name: 'List' }));
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it('applies the aria-label to the tablist', () => {
    render(
      <SegmentedControl
        value="list"
        onValueChange={() => {}}
        options={opts}
        aria-label="View mode"
      />,
    );
    expect(screen.getByRole('tablist')).toHaveAccessibleName('View mode');
  });

  it("supports an option's icon and per-option aria-label", () => {
    const optsWithIcon = [
      {
        value: 'a' as const,
        label: '',
        icon: <span data-testid="icon-a">A</span>,
        ariaLabel: 'Option A',
      },
      {
        value: 'b' as const,
        label: '',
        icon: <span data-testid="icon-b">B</span>,
        ariaLabel: 'Option B',
      },
    ];
    render(<SegmentedControl value="a" onValueChange={() => {}} options={optsWithIcon} />);
    expect(screen.getByTestId('icon-a')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Option A' })).toBeInTheDocument();
  });

  it('applies larger padding/font at size="md"', () => {
    const { container } = render(
      <SegmentedControl value="list" onValueChange={() => {}} options={opts} size="md" />,
    );
    const firstTab = container.querySelector('[role="tab"]')!;
    expect(firstTab.className).toMatch(/\bpx-3\b/);
    expect(firstTab.className).toMatch(/\btext-sm\b/);
  });
});
