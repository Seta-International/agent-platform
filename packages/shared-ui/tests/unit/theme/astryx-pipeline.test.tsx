import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Button } from '@astryxdesign/core/Button';
import { Theme } from '@astryxdesign/core/theme';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { setaTheme } from '../../../src/theme/astryx-seta.theme';

describe('Astryx pipeline smoke test', () => {
  it('renders a themed Astryx Button without throwing', () => {
    render(
      <Theme theme={setaTheme} mode="light">
        <Button label="Astryx pipeline OK" onClick={() => {}} />
      </Theme>,
    );

    expect(screen.getByRole('button', { name: 'Astryx pipeline OK' })).toBeInTheDocument();
  });

  it('compiles the Seta accent color into the generated theme CSS', () => {
    const css = readFileSync(
      resolve(__dirname, '../../../src/styles/astryx-seta-theme.css'),
      'utf-8',
    );

    expect(css.toUpperCase()).toContain('#0047FF');
  });
});
