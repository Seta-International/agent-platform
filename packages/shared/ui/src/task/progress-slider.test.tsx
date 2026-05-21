import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ProgressSlider } from './progress-slider';

describe('ProgressSlider', () => {
  it('renders the value and derives "Not started" at 0', () => {
    render(<ProgressSlider value={0} onChange={() => {}} />);
    expect(screen.getByText(/0/)).toBeInTheDocument();
    expect(screen.getByText(/Not started/)).toBeInTheDocument();
  });
  it('derives "In Progress" between 1 and 99', () => {
    render(<ProgressSlider value={60} onChange={() => {}} />);
    expect(screen.getByText(/In Progress/)).toBeInTheDocument();
  });
  it('derives "Done" at 100', () => {
    render(<ProgressSlider value={100} onChange={() => {}} />);
    expect(screen.getByText(/Done/)).toBeInTheDocument();
  });
  it('calls onChange when slider value changes', () => {
    const onChange = vi.fn();
    render(<ProgressSlider value={20} onChange={onChange} />);
    const slider = screen.getByRole('slider');
    fireEvent.keyDown(slider, { key: 'ArrowRight' });
    expect(onChange).toHaveBeenCalled();
  });
  it('renders tick markers at 0/25/50/75/100', () => {
    const { container } = render(<ProgressSlider value={50} onChange={() => {}} />);
    expect(container.querySelectorAll('[data-tick]')).toHaveLength(5);
  });
});
