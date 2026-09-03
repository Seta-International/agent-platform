import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const registered: string[] = [];
vi.mock('@assistant-ui/react', () => ({
  useAssistantDataUI: ({ name }: { name: string }) => {
    registered.push(name);
  },
  useAssistantToolUI: () => {},
}));
vi.mock('../../../src/hooks/use-tool-catalog', () => ({
  useToolCatalog: () => ({ tools: [], nameFor: (id: string) => id }),
}));

import { ToolUIRegistry } from '../../../src/components/tool-renderers';

describe('ToolUIRegistry data registrations', () => {
  it('registers result + trust data renderers', () => {
    registered.length = 0;
    render(<ToolUIRegistry />);
    expect(registered).toContain('result');
    expect(registered).toContain('trust');
    // The in-turn approval anchor; without this registration the card has no
    // renderer at its turn and only the transcript tail shows it.
    expect(registered).toContain('approval');
  });
});
