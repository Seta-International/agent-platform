import { Badge } from '@seta/shared-ui';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

describe('test harness', () => {
  it('renders a shared-ui component into happy-dom', () => {
    render(<Badge label="Sanity" />);
    expect(screen.getByText('Sanity')).toBeInTheDocument();
  });
});
