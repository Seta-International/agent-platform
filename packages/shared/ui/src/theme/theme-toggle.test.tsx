import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { ThemeProvider, useTheme } from './theme-provider';
import { ThemeToggle } from './theme-toggle';

beforeEach(() => {
  localStorage.clear();
  document.documentElement.classList.remove('theme-dark', 'theme-light');
});

function CurrentThemeProbe() {
  const { theme } = useTheme();
  return <span data-testid="t">{theme}</span>;
}

describe('ThemeToggle', () => {
  it('renders a toggle button under the provider', () => {
    render(
      <ThemeProvider>
        <ThemeToggle />
        <CurrentThemeProbe />
      </ThemeProvider>,
    );
    expect(screen.getByRole('button', { name: /toggle theme/i })).toBeInTheDocument();
    expect(screen.getByTestId('t').textContent).toBe('dark');
  });
});
