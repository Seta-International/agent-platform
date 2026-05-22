import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { GroupStatRow } from './GroupStatRow';

describe('GroupStatRow', () => {
  it('renders 4 stat cells (Plans, Open tasks, Members, Activity (7d))', () => {
    render(<GroupStatRow planCount={3} openTaskCount={12} memberCount={5} />);
    expect(screen.getByText('Plans')).toBeInTheDocument();
    expect(screen.getByText('Open tasks')).toBeInTheDocument();
    expect(screen.getByText('Members')).toBeInTheDocument();
    expect(screen.getByText('Activity (7d)')).toBeInTheDocument();
  });

  it('renders the planCount and memberCount as values', () => {
    render(<GroupStatRow planCount={3} openTaskCount={12} memberCount={5} />);
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('shows "—" + Loading… for Activity (7d) when activityCount is undefined (loading)', () => {
    render(<GroupStatRow planCount={0} openTaskCount={0} memberCount={0} />);
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.getByText(/Loading…/i)).toBeInTheDocument();
  });

  it('shows the activity count + "events in last 7 days" when activityCount is a number', () => {
    render(<GroupStatRow planCount={0} openTaskCount={0} memberCount={0} activityCount={42} />);
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText(/events in last 7 days/i)).toBeInTheDocument();
  });

  it('shows "—" + Unavailable when activityCount is null (load failed)', () => {
    render(<GroupStatRow planCount={0} openTaskCount={0} memberCount={0} activityCount={null} />);
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.getByText(/Unavailable/i)).toBeInTheDocument();
  });
});
