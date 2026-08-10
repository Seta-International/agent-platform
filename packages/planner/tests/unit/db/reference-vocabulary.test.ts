import { describe, expect, it } from 'vitest';
import { TASK_LINK_KINDS, TASK_REFERENCE_TYPES } from '../../../src/backend/db/schema.ts';
import { isTaskLinkKind } from '../../../src/backend/domain/_task-link-row.ts';

describe('the reference vocabulary', () => {
  it('contains every link kind, because TASK_LINK_KINDS is spread into it', () => {
    for (const kind of TASK_LINK_KINDS) {
      expect(TASK_REFERENCE_TYPES).toContain(kind);
    }
    expect(TASK_REFERENCE_TYPES).toHaveLength(13);
  });

  // The whole discriminator, in one assertion: 'link' is a BOOKMARK kind, which
  // is what leaves the dedup workflow's old rows in the URL group (§3.1, §3.4).
  it('treats `link` as a bookmark and only the three kinds as links', () => {
    expect(isTaskLinkKind('link')).toBe(false);
    expect(isTaskLinkKind('web')).toBe(false);
    expect(TASK_REFERENCE_TYPES.filter(isTaskLinkKind)).toEqual([
      'relates',
      'duplicates',
      'blocks',
    ]);
  });
});
