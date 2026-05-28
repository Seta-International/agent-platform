import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@ai-sdk/openai', () => ({
  openai: Object.assign(
    vi.fn(() => ({})),
    {
      embedding: vi.fn().mockReturnValue({ modelId: 'text-embedding-3-small' }),
    },
  ),
}));

const mockEmbed = vi.fn();
vi.mock('ai', () => ({ embed: mockEmbed }));

const MOCK_DOMAINS = ['work', 'people', 'self', 'meta', 'knowledge'];
vi.mock('@seta/agent-sdk', () => ({
  AgentRegistry: {
    snapshot: vi.fn().mockReturnValue({ domains: MOCK_DOMAINS }),
  },
}));

function unitVector(dim: number, i: number): number[] {
  const v = new Array<number>(dim).fill(0);
  v[i] = 1;
  return v;
}

describe('classifyDomain', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('returns null when classifier was never initialised and keywords miss', async () => {
    const { classifyDomain } = await import('../../src/backend/domain-classifier.ts');
    mockEmbed.mockResolvedValue({ embedding: unitVector(5, 0) });
    // Use neutral text so the keyword-fallback safety net (added after this
    // test was first written) also returns null. Otherwise "list my tasks"
    // matches the `task` work-keyword and the fallback would route to `work`.
    const result = await classifyDomain('something ambiguous');
    expect(result).toBeNull();
  });

  it('returns highest-scoring domain when confidence >= 0.75', async () => {
    const { initClassifier, classifyDomain } = await import(
      '../../src/backend/domain-classifier.ts'
    );
    const domains = ['work', 'people', 'self', 'meta', 'knowledge'];
    let callCount = 0;
    mockEmbed.mockImplementation(async () => ({
      embedding: unitVector(5, callCount++),
    }));
    await initClassifier();
    callCount = 0;
    const result = await classifyDomain('list my tasks');
    expect(result).not.toBeNull();
    expect(result!.domain).toBe(domains[0]);
    expect(result!.confidence).toBeCloseTo(1.0);
  });

  it('returns null when best confidence < 0.75', async () => {
    const { initClassifier, classifyDomain } = await import(
      '../../src/backend/domain-classifier.ts'
    );
    let callCount = 0;
    mockEmbed.mockImplementation(async () => {
      callCount++;
      if (callCount <= 5) return { embedding: unitVector(5, callCount - 1) };
      return { embedding: [0.447, 0.447, 0.447, 0.447, 0.447] };
    });
    await initClassifier();
    const result = await classifyDomain('do something');
    expect(result).toBeNull();
  });

  it('returns null without throwing when embed rejects during classify', async () => {
    const { initClassifier, classifyDomain } = await import(
      '../../src/backend/domain-classifier.ts'
    );
    let callCount = 0;
    mockEmbed.mockImplementation(async () => {
      if (callCount++ < 5) return { embedding: unitVector(5, callCount - 1) };
      throw new Error('network error');
    });
    await initClassifier();
    const result = await classifyDomain('something ambiguous');
    expect(result).toBeNull();
  });

  it('disables classifier gracefully when initClassifier embed fails', async () => {
    const { initClassifier, classifyDomain } = await import(
      '../../src/backend/domain-classifier.ts'
    );
    mockEmbed.mockRejectedValue(new Error('no api key'));
    await initClassifier();
    mockEmbed.mockResolvedValue({ embedding: unitVector(5, 0) });
    const result = await classifyDomain('something ambiguous');
    expect(result).toBeNull();
  });
});
