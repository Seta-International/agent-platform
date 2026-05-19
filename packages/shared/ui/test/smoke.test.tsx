import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

describe('vitest + RTL setup', () => {
  it('renders and queries with @testing-library', () => {
    render(<button type="button">click me</button>);
    expect(screen.getByRole('button', { name: /click me/i })).toBeInTheDocument();
  });
});
