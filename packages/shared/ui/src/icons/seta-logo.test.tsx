import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SetaLogo } from './seta-logo';
import { SetaMark } from './seta-mark';

describe('SetaLogo / SetaMark', () => {
  it('SetaLogo renders an img referring to the wordmark', () => {
    render(<SetaLogo />);
    const img = screen.getByRole('img', { name: /seta/i });
    expect(img.getAttribute('src')).toMatch(/seta-logo\.svg$/);
  });

  it('SetaLogo accepts custom height', () => {
    render(<SetaLogo height={28} />);
    expect(screen.getByRole('img', { name: /seta/i }).getAttribute('height')).toBe('28');
  });

  it('SetaMark renders an img referring to the square mark', () => {
    render(<SetaMark />);
    const img = screen.getByRole('img', { name: /seta/i });
    expect(img.getAttribute('src')).toMatch(/favicon\.svg$|seta-mark\.svg$/);
  });
});
