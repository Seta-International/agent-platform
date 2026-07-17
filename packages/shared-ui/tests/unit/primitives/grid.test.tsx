import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Grid, GridSpan } from '../../../src/primitives/grid';

describe('Grid', () => {
  it('re-exports Grid + GridSpan and renders children', () => {
    render(
      <Grid columns={3} gap={4} data-testid="g">
        <GridSpan>A</GridSpan>
        <GridSpan>B</GridSpan>
      </Grid>,
    );
    expect(screen.getByTestId('g')).toBeInTheDocument();
    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.getByText('B')).toBeInTheDocument();
  });
});
