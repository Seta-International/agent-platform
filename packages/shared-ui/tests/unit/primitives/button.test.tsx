import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Button } from '../../../src/primitives/button';

describe('Button', () => {
  it('renders the label as visible text and as the accessible name', () => {
    render(<Button label="Click" />);
    expect(screen.getByRole('button', { name: 'Click' })).toBeInTheDocument();
  });

  it.each([
    'primary',
    'secondary',
    'ghost',
    'destructive',
  ] as const)('renders the %s variant without throwing', (variant) => {
    render(<Button variant={variant} label={variant} />);
    expect(screen.getByRole('button', { name: variant })).toBeInTheDocument();
  });

  it.each(['sm', 'md', 'lg'] as const)('renders the %s size without throwing', (size) => {
    render(<Button size={size} label={size} />);
    expect(screen.getByRole('button', { name: size })).toBeInTheDocument();
  });

  it('disables the button via isDisabled', () => {
    render(<Button label="Disabled" isDisabled />);
    expect(screen.getByRole('button', { name: 'Disabled' })).toBeDisabled();
  });

  it('renders an icon-only button with the label as its accessible name', () => {
    render(<Button isIconOnly icon={<svg aria-hidden />} label="Delete" />);
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
  });

  it('renders as a link when href is provided', () => {
    render(<Button href="/x" label="link-btn" />);
    expect(screen.getByRole('link', { name: 'link-btn' })).toBeInTheDocument();
  });
});
