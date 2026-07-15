import { describe, expect, it } from 'vitest';
import {
  ConversationEntitiesSchema,
  EMPTY_ENTITIES,
  EMPTY_WORKING_MEMORY,
  parseEntities,
  parseWorkingMemory,
  serializeEntities,
  serializeWorkingMemory,
  WorkingMemorySchema,
} from '../../src/working-memory-schema.ts';

const UUID = '66be2be2-394d-4184-b106-c412289fd1e1';

describe('WorkingMemorySchema (userContext, resource-scoped)', () => {
  it('accepts the empty default', () => {
    expect(() => WorkingMemorySchema.parse(EMPTY_WORKING_MEMORY)).not.toThrow();
  });

  it('does not carry entities — entities live in their own thread-scoped store', () => {
    expect('entities' in EMPTY_WORKING_MEMORY).toBe(false);
  });

  it('parseWorkingMemory returns EMPTY on null/empty/invalid JSON', () => {
    expect(parseWorkingMemory(null)).toEqual(EMPTY_WORKING_MEMORY);
    expect(parseWorkingMemory('')).toEqual(EMPTY_WORKING_MEMORY);
    expect(parseWorkingMemory('not json')).toEqual(EMPTY_WORKING_MEMORY);
    expect(parseWorkingMemory('{"userContext": "not-an-object"}')).toEqual(EMPTY_WORKING_MEMORY);
  });

  it('parseWorkingMemory round-trips valid data', () => {
    const wm = {
      userContext: { ...EMPTY_WORKING_MEMORY.userContext, timezone: 'Asia/Ho_Chi_Minh' },
    };
    expect(parseWorkingMemory(serializeWorkingMemory(wm))).toEqual(wm);
  });
});

describe('ConversationEntitiesSchema (thread-scoped)', () => {
  it('accepts the empty default', () => {
    expect(() => ConversationEntitiesSchema.parse(EMPTY_ENTITIES)).not.toThrow();
  });

  it('rejects non-UUID taskId in recentTasks', () => {
    const bad = {
      ...EMPTY_ENTITIES,
      recentTasks: [{ taskId: 'not-a-uuid', title: 't', lastSeenAt: new Date().toISOString() }],
    };
    expect(() => ConversationEntitiesSchema.parse(bad)).toThrow(/uuid/i);
  });

  it('parseEntities returns EMPTY on null/empty/invalid/garbage', () => {
    expect(parseEntities(null)).toEqual(EMPTY_ENTITIES);
    expect(parseEntities('')).toEqual(EMPTY_ENTITIES);
    expect(parseEntities('not json')).toEqual(EMPTY_ENTITIES);
    expect(parseEntities('{"recentTasks": [{"taskId": "garbage"}]}')).toEqual(EMPTY_ENTITIES);
  });

  it('parseEntities round-trips valid data', () => {
    const entities = {
      ...EMPTY_ENTITIES,
      recentTasks: [{ taskId: UUID, title: 'T', lastSeenAt: new Date().toISOString() }],
      lastDiscussedTaskId: UUID,
    };
    expect(parseEntities(serializeEntities(entities))).toEqual(entities);
  });

  it('accepts recentDocuments and lastDiscussedDocumentId', () => {
    const data = {
      ...EMPTY_ENTITIES,
      recentDocuments: [
        { documentId: UUID, title: 'Report.pdf', lastSeenAt: '2026-07-15T03:00:00Z' },
      ],
      lastDiscussedDocumentId: UUID,
    };
    const parsed = ConversationEntitiesSchema.parse(data);
    expect(parsed.recentDocuments).toHaveLength(1);
    expect(parsed.lastDiscussedDocumentId).toBe(UUID);
  });

  it('EMPTY_ENTITIES has empty recentDocuments', () => {
    expect(EMPTY_ENTITIES.recentDocuments).toEqual([]);
    expect(EMPTY_ENTITIES.lastDiscussedDocumentId).toBeNull();
  });

  it('round-trips document fields through serialize/parse', () => {
    const data = {
      ...EMPTY_ENTITIES,
      recentDocuments: [
        { documentId: UUID, title: 'Design.docx', lastSeenAt: '2026-07-15T04:00:00Z' },
      ],
      lastDiscussedDocumentId: UUID,
    };
    const reparsed = parseEntities(serializeEntities(data));
    expect(reparsed.recentDocuments).toEqual(data.recentDocuments);
    expect(reparsed.lastDiscussedDocumentId).toBe(UUID);
  });
});
