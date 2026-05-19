import { act, render } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { ThemeProvider, useTheme } from './theme-provider';

beforeEach(() => {
  localStorage.clear();
  document.documentElement.classList.remove('theme-dark', 'theme-light');
});

function Probe() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  return (
    <>
      <span data-testid="theme">{theme}</span>
      <span data-testid="resolved">{resolvedTheme}</span>
      <button type="button" onClick={() => setTheme('light')}>
        to-light
      </button>
    </>
  );
}

describe('ThemeProvider', () => {
  it('applies `theme-dark` class by default', () => {
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(document.documentElement.classList.contains('theme-dark')).toBe(true);
  });

  it('persists theme choice to localStorage', () => {
    const { getByText } = render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    act(() => {
      getByText('to-light').click();
    });
    expect(localStorage.getItem('seta-theme')).toBe('light');
    expect(document.documentElement.classList.contains('theme-light')).toBe(true);
    expect(document.documentElement.classList.contains('theme-dark')).toBe(false);
  });

  it('reads initial theme from localStorage if present', () => {
    localStorage.setItem('seta-theme', 'light');
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(document.documentElement.classList.contains('theme-light')).toBe(true);
  });

  it('throws when useTheme called outside provider', () => {
    expect(() => render(<Probe />)).toThrow(/useTheme must be used inside <ThemeProvider>/);
  });
});
