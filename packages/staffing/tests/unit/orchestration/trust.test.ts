import type { TrustEnvelope } from '@seta/agent-sdk';
import { describe, expect, it } from 'vitest';
import { trustFromMastraResult } from '../../../src/backend/orchestration/trust.ts';

describe('trustFromMastraResult', () => {
  it('derives trace from toolCalls and citations from the extractor', () => {
    const trust: TrustEnvelope = trustFromMastraResult(
      {
        toolCalls: [
          { payload: { toolName: 'staffing_searchCandidates', args: { skills: ['aws'] } } },
        ],
        toolResults: [
          {
            payload: {
              toolName: 'staffing_searchCandidates',
              result: { hits: [{ userId: 'u1', name: 'A', similarity: 0.42 }] },
            },
          },
        ],
      },
      {
        citations: (tr) =>
          tr.payload.toolName === 'staffing_searchCandidates'
            ? (
                tr.payload.result as {
                  hits: { userId: string; name: string | null; similarity: number }[];
                }
              ).hits.map((h) => ({
                kind: 'user' as const,
                id: h.userId,
                label: h.name ?? undefined,
                score: h.similarity,
              }))
            : [],
        confidence: 0.42,
      },
    );
    expect(trust.reasoningTrace[0]?.step).toBe('staffing_searchCandidates');
    expect(trust.evidenceCitations).toEqual([{ kind: 'user', id: 'u1', label: 'A', score: 0.42 }]);
    expect(trust.confidenceScore).toBeCloseTo(0.42);
  });

  it('returns EMPTY_TRUST-shaped trust when there were no tool calls', () => {
    const trust = trustFromMastraResult(
      { toolCalls: [], toolResults: [] },
      { citations: () => [], confidence: 0 },
    );
    expect(trust.reasoningTrace).toEqual([]);
    expect(trust.evidenceCitations).toEqual([]);
    expect(trust.confidenceScore).toBe(0);
  });
});
