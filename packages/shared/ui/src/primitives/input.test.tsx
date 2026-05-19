import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Input } from './input';

describe('Input', () => {
  it('renders with focus ring at primary-focus token', () => {
    render(<Input placeholder="x" />);
    const input = screen.getByPlaceholderText('x');
    expect(input.className).toMatch(/focus-visible:ring-primary-focus/);
    expect(input.className).toMatch(/\bborder-hairline\b/);
  });
});
