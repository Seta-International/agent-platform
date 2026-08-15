import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BandLegend, ScoreChip } from '../../../src/components/performance-score-bits.tsx';

/** The swatch the legend paints for a band, as the browser resolves it. */
function legendSwatch(label: string): CSSStyleDeclaration {
  render(<BandLegend />);
  const row = screen.getByText(label).closest('div');
  const swatch = row?.querySelector('span[style]');
  if (!(swatch instanceof HTMLElement)) throw new Error(`no swatch for ${label}`);
  return swatch.style;
}

describe('ScoreChip', () => {
  it('paints a Strong score the green its own legend promises', () => {
    const strong = legendSwatch('Strong');
    const { container } = render(<ScoreChip value={4} />);
    const chip = container.querySelector('span[style]');

    // A 4.0 sitting grey under a legend that calls ≥ 4.0 green reads as "no band".
    expect((chip as HTMLElement).style.background).toBe(strong.background);
    expect((chip as HTMLElement).style.color).toBe(strong.color);
  });

  it('rounds to one decimal and shows an unscored group as an em dash', () => {
    const { container, rerender } = render(<ScoreChip value={3.75} />);
    expect(container.textContent).toBe('3.8');
    rerender(<ScoreChip value={null} />);
    expect(container.textContent).toBe('—');
  });
});
