import { describe, expect, it } from 'vitest';
import {
  CORE_SKILL_CATEGORY_CREATED,
  CORE_SKILL_CREATED,
  CORE_SKILL_EVENTS,
} from '../../src/backend/skills/events.ts';

describe('core skill events', () => {
  it('exposes the catalog event types and validates payloads', () => {
    expect(CORE_SKILL_CATEGORY_CREATED).toBe('core.skill_category.created');
    expect(CORE_SKILL_CREATED).toBe('core.skill.created');
    expect(() =>
      CORE_SKILL_EVENTS[CORE_SKILL_CREATED].parse({
        skill_id: crypto.randomUUID(),
        category_id: crypto.randomUUID(),
        tenant_id: crypto.randomUUID(),
      }),
    ).not.toThrow();
    expect(() => CORE_SKILL_EVENTS[CORE_SKILL_CREATED].parse({ skill_id: 'nope' })).toThrow();
  });
});
