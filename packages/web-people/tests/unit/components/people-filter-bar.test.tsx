import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PeopleFilterBar } from '../../../src/components/people-filter-bar.tsx';

describe('PeopleFilterBar', () => {
  it('renders all filter dropdowns and handles status selection and removal', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();

    const { rerender } = render(<PeopleFilterBar query={{}} onChange={onChange} />);

    const statusInput = screen.getByRole('combobox', { name: 'Status' });
    expect(statusInput).toBeInTheDocument();

    // Focus and click Status filter
    await user.click(statusInput);
    const onboardingOption = await screen.findByRole('option', { name: 'Onboarding' });
    expect(onboardingOption).toBeInTheDocument();

    // Select Onboarding
    await user.click(onboardingOption);
    expect(onChange).toHaveBeenCalledWith({ status: ['onboarding'] });

    // Rerender with selected status
    rerender(<PeopleFilterBar query={{ status: ['onboarding'] }} onChange={onChange} />);

    // Verify token exists
    const removeButton = screen.getByRole('button', { name: 'Remove Onboarding' });
    expect(removeButton).toBeInTheDocument();

    // Clear selected filter by clicking remove
    await user.click(removeButton);
    expect(onChange).toHaveBeenCalledWith({ status: undefined });

    // Rerender with status cleared
    rerender(<PeopleFilterBar query={{}} onChange={onChange} />);

    // Get fresh element reference after key update
    const freshStatusInput = screen.getByRole('combobox', { name: 'Status' });
    await user.click(freshStatusInput);
    const restoredOption = await screen.findByRole('option', { name: 'Onboarding' });
    expect(restoredOption).toBeInTheDocument();
  });
});
