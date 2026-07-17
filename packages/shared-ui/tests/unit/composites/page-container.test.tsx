import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PageContainer } from '../../../src/composites/page-container';

describe('PageContainer', () => {
  it('renders its children', () => {
    render(<PageContainer>hello</PageContainer>);
    expect(screen.getByText('hello')).toBeInTheDocument();
  });

  it('centres a fixed-width column with the shared page padding', () => {
    render(<PageContainer data-testid="pc">x</PageContainer>);
    const el = screen.getByTestId('pc');
    expect(el.className).toContain('mx-auto');
    expect(el.className).toContain('w-full');
    expect(el.className).toContain('max-w-[73.75rem]');
    expect(el.className).toContain('p-6');
  });

  it('appends caller layout classes', () => {
    render(
      <PageContainer className="grid grid-cols-2 gap-6" data-testid="pc">
        x
      </PageContainer>,
    );
    const el = screen.getByTestId('pc');
    expect(el.className).toContain('grid');
    expect(el.className).toContain('gap-6');
    expect(el.className).toContain('max-w-[73.75rem]');
  });

  // The old `.page-container` was unlayered, so it silently beat any utility a
  // caller passed. cn() resolves the conflict in the caller's favour instead —
  // the behaviour change this component is responsible for.
  it('lets a caller override the width and padding', () => {
    render(
      <PageContainer className="max-w-2xl py-8" data-testid="pc">
        x
      </PageContainer>,
    );
    const el = screen.getByTestId('pc');
    expect(el.className).toContain('max-w-2xl');
    expect(el.className).not.toContain('max-w-[73.75rem]');
  });

  it('forwards arbitrary props to the element', () => {
    render(
      <PageContainer id="main" aria-label="Page">
        x
      </PageContainer>,
    );
    expect(screen.getByLabelText('Page')).toHaveAttribute('id', 'main');
  });
});
