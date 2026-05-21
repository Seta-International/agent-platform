import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { GroupTile } from './group-tile';

describe('GroupTile', () => {
  it('renders initials from a multi-word name (first letter of first 2 tokens, uppercased)', () => {
    render(<GroupTile name="Engineering Team" theme="blue" />);
    expect(screen.getByText('ET')).toBeInTheDocument();
  });

  it('handles ampersand-separated names', () => {
    render(<GroupTile name="Security & Compliance" theme="red" />);
    expect(screen.getByText('SC')).toBeInTheDocument();
  });

  it('uses a single letter for single-word names', () => {
    render(<GroupTile name="Marketing" theme="orange" />);
    expect(screen.getByText('M')).toBeInTheDocument();
  });

  it('applies theme color via inline style', () => {
    const { container } = render(<GroupTile name="X" theme="green" size={28} />);
    const wrap = container.firstChild as HTMLElement;
    expect(wrap.style.background).toBe('var(--color-group-theme-green)');
  });

  it('scales size via inline style and uses smaller radius below 28px', () => {
    const { container } = render(<GroupTile name="X" theme="teal" size={24} />);
    const wrap = container.firstChild as HTMLElement;
    expect(wrap.style.width).toBe('24px');
    expect(wrap.style.height).toBe('24px');
    expect(wrap.style.borderRadius).toBe('5px');
  });

  it('uses radius 7 at 36px and above', () => {
    const { container } = render(<GroupTile name="X" theme="purple" size={36} />);
    const wrap = container.firstChild as HTMLElement;
    expect(wrap.style.borderRadius).toBe('7px');
  });

  it('marks the tile aria-hidden (purely decorative)', () => {
    const { container } = render(<GroupTile name="X" theme="pink" />);
    expect(container.firstChild).toHaveAttribute('aria-hidden');
  });

  it('passes through className to the wrap', () => {
    const { container } = render(<GroupTile name="X" theme="blue" className="ml-2" />);
    expect((container.firstChild as HTMLElement).className).toContain('ml-2');
  });
});
