import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PreviewBody, type PreviewBodyTask } from './preview-card';

const baseTask: PreviewBodyTask = {
  description: 'Add a write-through cache to reduce p95.',
  checklist: [
    { id: 'c1', text: 'Draft cache key schema', done: true },
    { id: 'c2', text: 'Architecture review', done: true },
    { id: 'c3', text: 'SSE invalidation test', done: false },
    { id: 'c4', text: 'PR opened', done: false },
    { id: 'c5', text: 'Deploy', done: false },
  ],
  references: [
    { id: 'r1', type: 'word', alias: 'Architecture review notes', host: 'docs.acme.com' },
  ],
};

describe('PreviewBody', () => {
  const variants = ['automatic', 'noPreview', 'checklist', 'description', 'reference'] as const;
  variants.forEach((v) => {
    it(`renders ${v} variant matching snapshot`, () => {
      const { container } = render(<PreviewBody task={baseTask} variant={v} />);
      expect(container.firstChild).toMatchSnapshot();
    });
  });

  it('renders empty automatic (no sources) as null', () => {
    const { container } = render(
      <PreviewBody task={{ references: [], description: '', checklist: [] }} variant="automatic" />,
    );
    expect(container.firstChild).toMatchSnapshot();
    expect(container.firstChild).toBeNull();
  });

  it('noPreview renders nothing', () => {
    const { container } = render(<PreviewBody task={baseTask} variant="noPreview" />);
    expect(container.firstChild).toBeNull();
  });

  it('automatic picks reference body when references present', () => {
    const { getByText } = render(<PreviewBody task={baseTask} variant="automatic" />);
    expect(getByText(/Architecture review notes/)).toBeInTheDocument();
    expect(getByText(/picked from references/)).toBeInTheDocument();
  });

  it('automatic falls back to description when no references', () => {
    const t = { ...baseTask, references: [] };
    const { getByText } = render(<PreviewBody task={t} variant="automatic" />);
    expect(getByText(/write-through cache/)).toBeInTheDocument();
    expect(getByText(/picked from description/)).toBeInTheDocument();
  });

  it('automatic falls back to checklist when no references and no description', () => {
    const t = { ...baseTask, references: [], description: '' };
    const { getByText } = render(<PreviewBody task={t} variant="automatic" />);
    expect(getByText(/Draft cache key schema/)).toBeInTheDocument();
    expect(getByText(/picked from checklist/)).toBeInTheDocument();
  });

  it('checklist body shows first 3 items and "2 of 5" count', () => {
    const { getByText, queryByText } = render(<PreviewBody task={baseTask} variant="checklist" />);
    expect(getByText('Draft cache key schema')).toBeInTheDocument();
    expect(getByText('Architecture review')).toBeInTheDocument();
    expect(getByText('SSE invalidation test')).toBeInTheDocument();
    expect(queryByText('PR opened')).not.toBeInTheDocument();
    expect(getByText('2 of 5')).toBeInTheDocument();
  });
});
