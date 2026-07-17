import { describe, expect, it } from 'vitest';
import {
  buildMentionPart,
  isMentionPart,
  type PendingMention,
  reconcileMentions,
} from '../../../src/lib/mention-part';

describe('buildMentionPart', () => {
  it('builds an AI SDK v6 `data-<name>` part with a generated id', () => {
    const part = buildMentionPart({ kind: 'person', id: 'w1', label: 'Jane Doe' });
    expect(part.type).toBe('data-entity-mention');
    expect(part.data).toEqual({ kind: 'person', id: 'w1', label: 'Jane Doe' });
    expect(part.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('mints a distinct id per part so repeated mentions do not collide', () => {
    const a = buildMentionPart({ kind: 'person', id: 'w1', label: 'Jane' });
    const b = buildMentionPart({ kind: 'person', id: 'w1', label: 'Jane' });
    expect(a.id).not.toBe(b.id);
  });

  it('copies the mention rather than aliasing the caller object', () => {
    const mention = { kind: 'person', id: 'w1', label: 'Jane' };
    const part = buildMentionPart(mention);
    mention.label = 'mutated';
    expect(part.data.label).toBe('Jane');
  });
});

describe('reconcileMentions', () => {
  const jane: PendingMention = {
    value: '@Jane Doe',
    mention: { kind: 'person', id: 'w1', label: 'Jane Doe' },
  };
  const john: PendingMention = {
    value: '@John Roe',
    mention: { kind: 'person', id: 'w2', label: 'John Roe' },
  };

  it('keeps mentions whose token text survived to submit', () => {
    expect(reconcileMentions([jane, john], 'ping @Jane Doe and @John Roe')).toEqual([
      jane.mention,
      john.mention,
    ]);
  });

  it('drops a mention whose token the user deleted before sending', () => {
    // The whole reason this reconciliation exists: inserting then deleting a
    // token must not smuggle the entity onto the message.
    expect(reconcileMentions([jane, john], 'ping @John Roe')).toEqual([john.mention]);
  });

  it('drops every mention when the user cleared the draft', () => {
    expect(reconcileMentions([jane, john], 'totally different text')).toEqual([]);
  });

  it('dedupes repeated mentions of the same entity', () => {
    expect(reconcileMentions([jane, jane], '@Jane Doe @Jane Doe')).toEqual([jane.mention]);
  });

  it('keeps distinct entities that share a label', () => {
    const other: PendingMention = {
      value: '@Jane Doe',
      mention: { kind: 'person', id: 'w9', label: 'Jane Doe' },
    };
    expect(reconcileMentions([jane, other], '@Jane Doe')).toEqual([jane.mention, other.mention]);
  });

  it('returns an empty list when nothing was inserted', () => {
    expect(reconcileMentions([], 'plain text')).toEqual([]);
  });
});

describe('isMentionPart', () => {
  it('accepts a well-formed mention part', () => {
    expect(isMentionPart(buildMentionPart({ kind: 'person', id: 'w1', label: 'Jane' }))).toBe(true);
  });

  it('rejects other part kinds and malformed data', () => {
    expect(isMentionPart({ type: 'data-page-context', id: 'x', data: {} })).toBe(false);
    expect(isMentionPart({ type: 'text', text: 'hi' })).toBe(false);
    expect(isMentionPart({ type: 'data-entity-mention', id: 'x' })).toBe(false);
    expect(isMentionPart({ type: 'data-entity-mention', id: 'x', data: { kind: 'person' } })).toBe(
      false,
    );
    expect(isMentionPart(null)).toBe(false);
    expect(isMentionPart('nope')).toBe(false);
  });
});
