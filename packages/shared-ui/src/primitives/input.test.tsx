import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Input } from './input';

describe('Input', () => {
  it('renders with hairline-strong border and primary-tint focus glow', () => {
    render(<Input placeholder="x" />);
    const input = screen.getByPlaceholderText('x');
    expect(input.className).toMatch(/\bborder-hairline-strong\b/);
    expect(input.className).toMatch(/focus-visible:border-primary/);
    expect(input.className).toMatch(/--color-primary-tint/);
  });
});
