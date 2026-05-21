import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PreviewCard, type PreviewCardTask } from './preview-card';

const baseTask: PreviewCardTask = {
  id: 't1',
  title: 'Cache layer for /tasks API',
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
  priority: 'urgent',
  labels: [{ name: 'api', color: 'var(--color-primary)' }],
  assignees: [
    { user_id: 'u1', display_name: 'Jane Doe' },
    { user_id: 'u2', display_name: 'Mark Lee' },
  ],
  due_at: '2026-08-18',
};

describe('PreviewCard', () => {
  const variants = ['automatic', 'noPreview', 'checklist', 'description', 'reference'] as const;
  variants.forEach((v) => {
    it(`renders ${v} variant matching snapshot`, () => {
      const { container } = render(<PreviewCard task={baseTask} variant={v} />);
      expect(container.firstChild).toMatchSnapshot();
    });
  });

  it('automatic picks reference body when references present', () => {
    const { getByText } = render(<PreviewCard task={baseTask} variant="automatic" />);
    expect(getByText(/Architecture review notes/)).toBeInTheDocument();
    expect(getByText(/picked from references/)).toBeInTheDocument();
  });

  it('automatic falls back to description when no references', () => {
    const t = { ...baseTask, references: [] };
    const { getByText } = render(<PreviewCard task={t} variant="automatic" />);
    expect(getByText(/write-through cache/)).toBeInTheDocument();
    expect(getByText(/picked from description/)).toBeInTheDocument();
  });

  it('automatic falls back to checklist when no references and no description', () => {
    const t = { ...baseTask, references: [], description: '' };
    const { getByText } = render(<PreviewCard task={t} variant="automatic" />);
    expect(getByText(/Draft cache key schema/)).toBeInTheDocument();
    expect(getByText(/picked from checklist/)).toBeInTheDocument();
  });

  it('automatic renders no preview-body when all sources empty', () => {
    const t = { ...baseTask, references: [], description: '', checklist: [] };
    const { container } = render(<PreviewCard task={t} variant="automatic" />);
    expect(container.querySelectorAll('[data-role="preview-body"]')).toHaveLength(0);
  });

  it('noPreview renders title + footer only', () => {
    const { container } = render(<PreviewCard task={baseTask} variant="noPreview" />);
    expect(container.querySelectorAll('[data-role="preview-body"]')).toHaveLength(0);
  });

  it('checklist body shows first 3 items and "2 of 5" count', () => {
    const { getByText, queryByText } = render(<PreviewCard task={baseTask} variant="checklist" />);
    expect(getByText('Draft cache key schema')).toBeInTheDocument();
    expect(getByText('Architecture review')).toBeInTheDocument();
    expect(getByText('SSE invalidation test')).toBeInTheDocument();
    expect(queryByText('PR opened')).not.toBeInTheDocument();
    expect(getByText('2 of 5')).toBeInTheDocument();
  });

  it('footer renders priority, first label, due day-of-week, and avatar stack', () => {
    const { getByText, getByRole, getByTitle } = render(
      <PreviewCard task={baseTask} variant="noPreview" />,
    );
    expect(getByRole('img', { name: 'Urgent priority' })).toBeInTheDocument();
    expect(getByText('api')).toBeInTheDocument();
    expect(getByText('Tue')).toBeInTheDocument();
    expect(getByTitle('Jane Doe')).toBeInTheDocument();
    expect(getByTitle('Mark Lee')).toBeInTheDocument();
  });
});
