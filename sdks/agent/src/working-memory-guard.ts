import { WorkingMemorySchema, WorkingMemoryUserContextSchema } from './working-memory-schema.ts';

type InnerTool = {
  id?: string;
  description?: string;
  execute: (input: { memory: string }, ctx: unknown) => Promise<unknown>;
  [key: string]: unknown;
};

const UserContextOnlySchema = WorkingMemorySchema.pick({ userContext: true })
  .extend({ userContext: WorkingMemoryUserContextSchema.partial() })
  .partial()
  .passthrough();

export function wrapUpdateWorkingMemoryTool(inner: InnerTool): InnerTool {
  const wrappedExecute = async (input: { memory: string }, ctx: unknown): Promise<unknown> => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(input.memory);
    } catch {
      return {
        success: false,
        reason:
          'updateWorkingMemory: memory must be a JSON object matching the working-memory schema.',
      };
    }

    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return {
        success: false,
        reason:
          'updateWorkingMemory: memory must be a JSON object matching the working-memory schema.',
      };
    }

    const raw = parsed as Record<string, unknown>;
    const droppedEntities = 'entities' in raw;
    const withoutEntities: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(raw)) {
      if (key !== 'entities') {
        withoutEntities[key] = value;
      }
    }

    if (droppedEntities) {
      console.warn(
        '[working-memory-guard] dropped entity-zone write attempted by LLM; ' +
          'entity fields are server-owned.',
      );
    }

    if (Object.keys(withoutEntities).length === 0) {
      return { success: true, reason: 'no-op: entity zone is server-owned' };
    }

    const validated = UserContextOnlySchema.safeParse(withoutEntities);
    if (!validated.success) {
      return {
        success: false,
        reason: `updateWorkingMemory: payload failed schema validation — ${validated.error.message}`,
      };
    }

    return inner.execute({ memory: JSON.stringify(validated.data) }, ctx);
  };

  return { ...inner, execute: wrappedExecute };
}
