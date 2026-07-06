import { describe, expect, it } from 'vitest';
import {
  formatSuggestionReason,
  matchLabel,
  matchRationale,
} from '../../../src/components/assignee-suggestion-format';

const base = {
  user_id: 'u1',
  display_name: 'An',
  score: 0.92,
  skills: ['React', 'TypeScript'],
  exact_overlap: 2,
  open_task_count: 2,
  hours_available_this_week: 12,
  timezone: 'GMT+7',
};

describe('assignee suggestion formatting', () => {
  it('reason line is compact with top skill and availability', () => {
    const r = formatSuggestionReason(base);
    expect(r).toContain('React');
    expect(r).toContain('12h');
  });
  it('shows only the matched skills, not the person’s full skill list', () => {
    const r = formatSuggestionReason({ ...base, matched_skills: ['React'] });
    expect(r).toContain('React');
    expect(r).not.toContain('TypeScript');
  });
  it('banks the score into a qualitative match label', () => {
    expect(matchLabel(0.92)).toBe('Excellent match');
    expect(matchLabel(0.72)).toBe('Strong match');
    expect(matchLabel(0.55)).toBe('Good match');
    expect(matchLabel(0.2)).toBe('Possible match');
  });
  it('rationale names exact overlap and spare capacity as drivers', () => {
    const r = matchRationale(base);
    expect(r).toContain('exact skill overlap');
    expect(r).toContain('available capacity');
  });
  it('rationale falls back to overall fit when no signals stand out', () => {
    const r = matchRationale({
      ...base,
      skills: [],
      exact_overlap: 0,
      open_task_count: null,
      hours_available_this_week: null,
    });
    expect(r).toBe('Ranked by overall fit for this task.');
  });
  it('falls back to a non-empty reason when no signals are available', () => {
    const r = formatSuggestionReason({
      ...base,
      skills: [],
      open_task_count: null,
      hours_available_this_week: null,
    });
    expect(r).toBe('Suggested');
  });
});
