import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MiniGantt, xForDay } from './mini-gantt';

describe('MiniGantt', () => {
  it('draws 7 day-axis ticks', () => {
    const { container } = render(
      <MiniGantt start="2026-08-12" due="2026-08-18" today="2026-08-15" title="X" />,
    );
    expect(container.querySelectorAll('line[stroke-dasharray]').length).toBeGreaterThanOrEqual(7);
  });
  it('positions the bar across the full visible window when start=day0 and due=day6', () => {
    const { container } = render(
      <MiniGantt start="2026-08-12" due="2026-08-18" today="2026-08-15" title="X" />,
    );
    const bar = container.querySelector('rect[data-role="bar"]') as SVGRectElement;
    const expectedX = xForDay('2026-08-12', '2026-08-12', '2026-08-18');
    const expectedEnd = xForDay('2026-08-18', '2026-08-12', '2026-08-18');
    expect(Number(bar.getAttribute('x'))).toBeCloseTo(expectedX, 0);
    expect(Number(bar.getAttribute('width'))).toBeCloseTo(expectedEnd - expectedX, 0);
  });
  it('positions the today marker between start and due using xForDay', () => {
    const { container } = render(
      <MiniGantt start="2026-08-12" due="2026-08-18" today="2026-08-15" title="X" />,
    );
    const today = container.querySelector('line[data-role="today"]') as SVGLineElement;
    const expected = xForDay('2026-08-15', '2026-08-12', '2026-08-18');
    expect(Number(today.getAttribute('x1'))).toBeCloseTo(expected, 0);
  });
  it('renders nothing when start or due is missing', () => {
    const { container } = render(
      <MiniGantt start={null} due={null} today="2026-08-15" title="X" />,
    );
    expect(container.querySelector('svg')).toBeNull();
  });
});
