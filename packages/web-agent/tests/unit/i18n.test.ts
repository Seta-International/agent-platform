import { describe, expect, it } from 'vitest';
import { EMPTY_LANES } from '../../src/i18n';

describe('EMPTY_LANES', () => {
  it('lists the four lanes in the locked order, General first', () => {
    expect(EMPTY_LANES.map((l) => l.id)).toEqual(['general', 'planner', 'people', 'knowledge']);
  });

  it('gives every lane exactly three cards, each with a title and a prompt', () => {
    for (const lane of EMPTY_LANES) {
      expect(lane.cards).toHaveLength(3);
      for (const card of lane.cards) {
        expect(card.title.length).toBeGreaterThan(0);
        expect(card.prompt.length).toBeGreaterThan(0);
      }
    }
  });

  it('never offers a Knowledge upload prompt (search-only guardrail)', () => {
    const knowledge = EMPTY_LANES.find((l) => l.id === 'knowledge');
    const prompts = knowledge?.cards.map((c) => c.prompt.toLowerCase()) ?? [];
    expect(prompts.some((p) => p.includes('upload'))).toBe(false);
  });
});
