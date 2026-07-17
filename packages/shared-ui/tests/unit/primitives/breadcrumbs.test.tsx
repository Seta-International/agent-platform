import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BreadcrumbItem, Breadcrumbs, LinkProvider } from '../../../src/primitives/breadcrumbs';

// Deliberately narrowed to the vendor-documented contract (href, className, style, children —
// see Astryx's `LinkComponentType` docs) and nothing else. Used below only to prove routing
// through a provided component; it must NOT gain onClick — see `ForwardingLink` for the stub
// that models the real production seam (ShellLink's `...rest` spread).
function StubLink({
  href,
  className,
  style,
  children,
}: {
  href?: string;
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}) {
  return (
    <a href={href} className={className} style={style} data-stub="true">
      {children}
    </a>
  );
}

// Mirrors production `ShellLink` (packages/shared-ui/src/composites/shell-link.tsx): destructures
// the documented props and forward-spreads everything else — including onClick — onto the
// underlying <a>. This is the actual seam Astryx's LinkProvider relies on in apps/web; unlike
// `StubLink` above, nothing here special-cases onClick.
function ForwardingLink({
  href,
  className,
  style,
  children,
  ...rest
}: {
  href?: string;
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
} & Record<string, unknown>) {
  return (
    <a href={href} className={className} style={style} {...rest}>
      {children}
    </a>
  );
}

describe('Breadcrumbs (Astryx contract under happy-dom)', () => {
  it('renders a nav landmark with linked crumbs and a non-link current item', () => {
    render(
      <Breadcrumbs variant="supporting">
        <BreadcrumbItem href="/pm">Project Monitoring</BreadcrumbItem>
        <BreadcrumbItem href="/pm/projects">Projects</BreadcrumbItem>
        <BreadcrumbItem isCurrent>Apollo</BreadcrumbItem>
      </Breadcrumbs>,
    );
    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(nav.querySelector('ol')).not.toBeNull();
    const links = within(nav).getAllByRole('link');
    expect(links.map((l) => l.getAttribute('href'))).toEqual(['/pm', '/pm/projects']);
    expect(within(nav).getByText('Apollo').closest('a')).toBeNull();
  });

  it('renders a middle crumb without href as plain text (not a link)', () => {
    render(
      <Breadcrumbs>
        <BreadcrumbItem href="/planner/groups">Planner</BreadcrumbItem>
        <BreadcrumbItem>Design group</BreadcrumbItem>
        <BreadcrumbItem isCurrent>Sprint plan</BreadcrumbItem>
      </Breadcrumbs>,
    );
    expect(screen.getByText('Design group').closest('a')).toBeNull();
  });

  it('routes crumb links through the LinkProvider component', () => {
    render(
      <LinkProvider component={StubLink}>
        <Breadcrumbs>
          <BreadcrumbItem href="/pm">Project Monitoring</BreadcrumbItem>
          <BreadcrumbItem isCurrent>Projects</BreadcrumbItem>
        </Breadcrumbs>
      </LinkProvider>,
    );
    expect(screen.getByRole('link', { name: 'Project Monitoring' })).toHaveAttribute(
      'data-stub',
      'true',
    );
  });

  it('supports onClick alongside href (behavior-carrying crumb)', () => {
    let clicked = false;
    render(
      <Breadcrumbs>
        <BreadcrumbItem
          href="/planner/plans/p1"
          onClick={(e) => {
            e.preventDefault();
            clicked = true;
          }}
        >
          Sprint plan
        </BreadcrumbItem>
        <BreadcrumbItem isCurrent>T-42</BreadcrumbItem>
      </Breadcrumbs>,
    );
    screen.getByRole('link', { name: 'Sprint plan' }).click();
    expect(clicked).toBe(true);
  });

  it('LinkProvider seam: a behavior-carrying crumb (href + onClick) fires through the provided link component', () => {
    let clicked = false;
    render(
      <LinkProvider component={ForwardingLink}>
        <Breadcrumbs>
          <BreadcrumbItem
            href="/planner/plans/p1"
            onClick={(e) => {
              e.preventDefault();
              clicked = true;
            }}
          >
            Sprint plan
          </BreadcrumbItem>
          <BreadcrumbItem isCurrent>T-42</BreadcrumbItem>
        </Breadcrumbs>
      </LinkProvider>,
    );
    screen.getByRole('link', { name: 'Sprint plan' }).click();
    expect(clicked).toBe(true);
  });
});
