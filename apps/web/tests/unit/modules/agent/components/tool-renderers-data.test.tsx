import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const registered: string[] = [];
vi.mock('@assistant-ui/react', () => ({
  useAssistantDataUI: ({ name }: { name: string }) => {
    registered.push(name);
  },
  useAssistantToolUI: () => {},
}));
vi.mock('@/modules/agent/hooks/use-tool-catalog', () => ({
  useToolCatalog: () => ({ tools: [], nameFor: (id: string) => id }),
}));

import { ToolUIRegistry } from '@/modules/agent/components/tool-renderers';

describe('ToolUIRegistry data registrations', () => {
  it('registers result + trust data renderers', () => {
    registered.length = 0;
    render(<ToolUIRegistry />);
    expect(registered).toContain('result');
    expect(registered).toContain('trust');
  });
});
