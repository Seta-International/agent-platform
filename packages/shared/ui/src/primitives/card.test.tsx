import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Card } from './card';

describe('Card', () => {
  it('default variant uses surface-1 + rounded-lg', () => {
    const { container } = render(<Card data-testid="c">x</Card>);
    const el = container.querySelector('[data-testid=c]');
    expect(el?.className).toMatch(/\bbg-surface-1\b/);
    expect(el?.className).toMatch(/\brounded-lg\b/);
  });

  it('product variant uses rounded-xl', () => {
    const { container } = render(
      <Card variant="product" data-testid="c">
        x
      </Card>,
    );
    expect(container.querySelector('[data-testid=c]')?.className).toMatch(/\brounded-xl\b/);
  });

  it('testimonial variant uses larger padding + body-lg', () => {
    const { container } = render(
      <Card variant="testimonial" data-testid="c">
        x
      </Card>,
    );
    const cls = container.querySelector('[data-testid=c]')?.className;
    expect(cls).toMatch(/\bp-xl\b/);
    expect(cls).toMatch(/\btext-body-lg\b/);
  });
});
