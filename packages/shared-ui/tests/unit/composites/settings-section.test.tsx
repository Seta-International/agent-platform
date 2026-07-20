import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SettingsSection } from '../../../src/composites/settings-section';

describe('SettingsSection', () => {
  it('renders the title as a level-3 heading', () => {
    render(<SettingsSection title="Login">rows</SettingsSection>);
    expect(screen.getByRole('heading', { level: 3, name: 'Login' })).toBeInTheDocument();
  });

  it('renders the optional description', () => {
    render(
      <SettingsSection title="Login" description="How people sign in.">
        rows
      </SettingsSection>,
    );
    expect(screen.getByText('How people sign in.')).toBeInTheDocument();
  });

  it('renders children after the divider', () => {
    render(<SettingsSection title="Login">row-content</SettingsSection>);
    expect(screen.getByText('row-content')).toBeInTheDocument();
  });
});
