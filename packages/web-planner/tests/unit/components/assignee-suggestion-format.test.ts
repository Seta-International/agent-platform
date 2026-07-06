import { describe, expect, it } from 'vitest';
import {
  formatSuggestionReason,
  formatSuggestionTooltip,
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
  it('tooltip explains the score with the signal breakdown', () => {
    const t = formatSuggestionTooltip(base);
    expect(t).toContain('92%');
    expect(t).toContain('React');
    expect(t).toContain('2 open');
  });
  it('omits missing signals gracefully', () => {
    const t = formatSuggestionTooltip({
      ...base,
      open_task_count: null,
      hours_available_this_week: null,
      timezone: null,
    });
    expect(t).toContain('92%');
    expect(t).not.toContain('null');
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
