import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockEmbed = vi.fn();
vi.mock('@seta/shared-embeddings', () => ({
  resolveEmbeddingProvider: () => ({ embed: mockEmbed }),
}));

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
    mockEmbed.mockResolvedValue([unitVector(5, 0)]);
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
    mockEmbed.mockImplementation(async (texts: string[]) =>
      texts.length === 1 ? [unitVector(5, 0)] : texts.map((_, i) => unitVector(5, i)),
    );
    await initClassifier();
    const result = await classifyDomain('list my tasks');
    expect(result).not.toBeNull();
    expect(result!.domain).toBe(domains[0]);
    expect(result!.confidence).toBeCloseTo(1.0);
  });

  it('returns null when best confidence < 0.75', async () => {
    const { initClassifier, classifyDomain } = await import(
      '../../src/backend/domain-classifier.ts'
    );
    mockEmbed.mockImplementation(async (texts: string[]) =>
      texts.length === 1
        ? [[0.447, 0.447, 0.447, 0.447, 0.447]]
        : texts.map((_, i) => unitVector(5, i)),
    );
    await initClassifier();
    const result = await classifyDomain('do something');
    expect(result).toBeNull();
  });

  it('returns null without throwing when embed rejects during classify', async () => {
    const { initClassifier, classifyDomain } = await import(
      '../../src/backend/domain-classifier.ts'
    );
    mockEmbed.mockImplementation(async (texts: string[]) => {
      if (texts.length === 1) throw new Error('network error');
      return texts.map((_, i) => unitVector(5, i));
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
    mockEmbed.mockResolvedValue([unitVector(5, 0)]);
    const result = await classifyDomain('something ambiguous');
    expect(result).toBeNull();
  });
});
