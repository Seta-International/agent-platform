import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { EntityRef } from '../../../src/composites/hitl-blocks';
import { blockRenderers } from '../../../src/composites/hitl-blocks';

describe('hitl block renderers', () => {
  it('has a renderer for every supported kind', () => {
    for (const kind of ['markdown', 'kvTable', 'entityList', 'confidence', 'citations', 'diff']) {
      expect(blockRenderers[kind]).toBeDefined();
    }
  });

  it('entityList multi renders checkboxes + a top-match badge', () => {
    const EntityList = blockRenderers.entityList;
    expect(EntityList).toBeDefined();
    if (!EntityList) return;
    render(
      <EntityList
        block={{
          kind: 'entityList',
          select: 'multi',
          items: [{ id: 'u1', type: 'user', label: 'Alice', primary: true, score: 0.8 }],
        }}
        selectedIds={['u1']}
        onToggle={() => {}}
        renderEntity={(e: EntityRef) => <span>{e.label}</span>}
      />,
    );
    expect(screen.getByRole('checkbox')).toBeChecked();
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText(/top match/i)).toBeInTheDocument();
  });
});
