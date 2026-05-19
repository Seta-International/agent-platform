import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Button } from './button';

describe('Button', () => {
  it('renders primary variant by default with Seta blue surface', () => {
    render(<Button>Click</Button>);
    const btn = screen.getByRole('button', { name: 'Click' });
    expect(btn.className).toMatch(/\bbg-primary\b/);
    expect(btn.className).toMatch(/\btext-on-primary\b/);
  });

  it('renders secondary variant with surface-1 charcoal', () => {
    render(<Button variant="secondary">S</Button>);
    expect(screen.getByRole('button', { name: 'S' }).className).toMatch(/\bbg-surface-1\b/);
  });

  it('renders tertiary variant with canvas background', () => {
    render(<Button variant="tertiary">T</Button>);
    expect(screen.getByRole('button', { name: 'T' }).className).toMatch(/\bbg-canvas\b/);
  });

  it('renders inverse variant with inverse-canvas background', () => {
    render(<Button variant="inverse">I</Button>);
    const btn = screen.getByRole('button', { name: 'I' });
    expect(btn.className).toMatch(/\bbg-inverse-canvas\b/);
    expect(btn.className).toMatch(/\btext-inverse-ink\b/);
  });

  it('renders destructive variant', () => {
    render(<Button variant="destructive">D</Button>);
    expect(screen.getByRole('button', { name: 'D' }).className).toMatch(/\bbg-destructive\b/);
  });

  it('renders ghost variant', () => {
    render(<Button variant="ghost">G</Button>);
    const btn = screen.getByRole('button', { name: 'G' });
    expect(btn.className).not.toMatch(/\bbg-primary\b/);
    expect(btn.className).toMatch(/hover:bg-surface-2/);
  });

  it('supports size variants', () => {
    render(<Button size="sm">small</Button>);
    expect(screen.getByRole('button', { name: 'small' }).className).toMatch(/h-8|h-9/);
  });

  it('renders asChild', () => {
    render(
      <Button asChild>
        <a href="/x">link-btn</a>
      </Button>,
    );
    expect(screen.getByRole('link', { name: 'link-btn' })).toBeInTheDocument();
  });
});
