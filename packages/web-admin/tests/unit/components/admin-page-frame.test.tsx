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

  it('keeps the subheader pinned outside the scrollable content region', () => {
    const { container } = render(
      <AdminPageFrame
        crumb="General"
        title="General"
        subheader={<div role="toolbar" aria-label="General filters" />}
      >
        page-body
      </AdminPageFrame>,
    );

    const toolbar = screen.getByRole('toolbar', { name: 'General filters' });
    // `.astryx-layout-content` is the Astryx `LayoutContent` component's own stable,
    // documented base class — not a StyleX atomic-class hash — so it's safe to assert
    // on (see `tests/unit/users/directory-page.test.tsx`).
    const content = container.querySelector('.astryx-layout-content');
    expect(content).not.toBeNull();
    expect(content?.contains(toolbar)).toBe(false);
  });

  it('caps the content width by default', () => {
    const { container } = render(
      <AdminPageFrame crumb="General" title="General">
        page-body
      </AdminPageFrame>,
    );
    expect(container.querySelector('.max-w-\\[73\\.75rem\\]')).not.toBeNull();
  });

  it('drops the width cap when isFullWidth is set', () => {
    const { container } = render(
      <AdminPageFrame crumb="Directory" title="Directory" isFullWidth>
        page-body
      </AdminPageFrame>,
    );
    // tailwind-merge resolves the conflict, so the capped class is replaced outright
    // rather than both landing on the element.
    expect(container.querySelector('.max-w-\\[73\\.75rem\\]')).toBeNull();
    expect(container.querySelector('.max-w-none')).not.toBeNull();
  });
});
