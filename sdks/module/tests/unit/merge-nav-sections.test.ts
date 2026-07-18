import { describe, expect, it, vi } from 'vitest';
import { mergeNavSections, type NavSection } from '../../src/index.ts';

const base: NavSection[] = [
  {
    label: 'Workspace',
    items: [
      { id: 'agent.chat', label: 'Chat', to: '/agent/chat' },
      { id: 'agent.workflows', label: 'Workflows', to: '/agent/workflows' },
    ],
  },
];

describe('mergeNavSections', () => {
  it('returns the base untouched when there are no extensions', () => {
    expect(mergeNavSections(base, [])).toBe(base);
  });

  it('augments a matching item with children/collapsible without clobbering label/to', () => {
    const onClick = vi.fn();
    const merged = mergeNavSections(base, [
      {
        label: 'Workspace',
        items: [
          {
            id: 'agent.chat',
            label: 'ignored',
            collapsible: { defaultIsCollapsed: false },
            children: [{ id: 'agent.chat.t1', label: 'Thread 1', onClick }],
          },
        ],
      },
    ]);

    const chat = merged[0]?.items.find((i) => i.id === 'agent.chat');
    // Base identity wins (drives active-state resolution); only the dynamic bits merge in.
    expect(chat?.label).toBe('Chat');
    expect(chat?.to).toBe('/agent/chat');
    expect(chat?.collapsible).toEqual({ defaultIsCollapsed: false });
    expect(chat?.children).toHaveLength(1);
    expect(chat?.children?.[0]?.id).toBe('agent.chat.t1');
    // Untouched sibling stays as-is.
    expect(merged[0]?.items.find((i) => i.id === 'agent.workflows')?.children).toBeUndefined();
  });

  it('appends extension items with no static counterpart within the matched section', () => {
    const merged = mergeNavSections(base, [
      { label: 'Workspace', items: [{ id: 'agent.extra', label: 'Extra' }] },
    ]);
    expect(merged[0]?.items.map((i) => i.id)).toEqual([
      'agent.chat',
      'agent.workflows',
      'agent.extra',
    ]);
  });

  it('appends extension sections that match no base label after the static sections', () => {
    const merged = mergeNavSections(base, [
      { label: 'Recents', items: [{ id: 'r1', label: 'Recent' }] },
    ]);
    expect(merged.map((s) => s.label)).toEqual(['Workspace', 'Recents']);
  });

  it('does not mutate the base sections', () => {
    const snapshot = JSON.stringify(base);
    mergeNavSections(base, [
      {
        label: 'Workspace',
        items: [{ id: 'agent.chat', label: 'x', children: [{ id: 'c', label: 'c' }] }],
      },
    ]);
    expect(JSON.stringify(base)).toBe(snapshot);
  });
});
