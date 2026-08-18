import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PaginationFooter } from '../../../src/primitives/pagination';

describe('PaginationFooter', () => {
  it('renders the pager without a page-size selector when no options are given', () => {
    render(
      <PaginationFooter page={1} onChange={vi.fn()} totalItems={40} pageSize={10} label="Rows" />,
    );

    expect(screen.getByRole('navigation', { name: 'Rows' })).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('reports the picked page size through onPageSizeChange as a number', async () => {
    const onPageSizeChange = vi.fn();
    const user = userEvent.setup();
    render(
      <PaginationFooter
        page={1}
        onChange={vi.fn()}
        totalItems={40}
        pageSize={10}
        pageSizeOptions={[10, 25, 50, 100]}
        onPageSizeChange={onPageSizeChange}
        label="Rows"
      />,
    );

    await user.click(screen.getByRole('combobox', { name: 'Items per page' }));
    await user.click(await screen.findByRole('option', { name: '50' }));

    expect(onPageSizeChange).toHaveBeenCalledWith(50);
  });

  it('renders nothing when there is no item to page through', () => {
    const { container } = render(
      <PaginationFooter
        page={1}
        onChange={vi.fn()}
        totalItems={0}
        pageSize={10}
        pageSizeOptions={[10, 25, 50, 100]}
        onPageSizeChange={vi.fn()}
        label="Rows"
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
