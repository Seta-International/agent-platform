import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { InfoRow } from '../../../src/composites/info-row';
import { Button } from '../../../src/primitives/button';

describe('InfoRow', () => {
  it('renders label and value', () => {
    render(<InfoRow label="Password" value="Not created" />);
    expect(screen.getByText('Password')).toBeInTheDocument();
    expect(screen.getByText('Not created')).toBeInTheDocument();
  });

  it('renders the action node', () => {
    render(
      <InfoRow
        label="Google"
        value="Connected"
        action={<Button variant="ghost" size="sm" label="Disconnect" onClick={() => {}} />}
      />,
    );
    expect(screen.getByRole('button', { name: 'Disconnect' })).toBeInTheDocument();
  });
});
