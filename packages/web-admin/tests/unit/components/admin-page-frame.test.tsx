import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AdminPageFrame } from '../../../src/components/AdminPageFrame';

describe('AdminPageFrame', () => {
  it('renders crumb, level-1 title, and children', () => {
    render(
      <AdminPageFrame crumb="General" title="General">
        page-body
      </AdminPageFrame>,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'General' })).toBeInTheDocument();
    expect(screen.getByText('page-body')).toBeInTheDocument();
  });
});
