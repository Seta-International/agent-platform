/**
 * Tool result compression middleware.
 *
 * When a tool returns a payload larger than TOKEN_ESTIMATE_THRESHOLD characters,
 * it is compressed into a structured summary that preserves IDs and key facts
 * but reduces the token footprint stored in the conversation history.
 *
 * This prevents large tool results (e.g. 50+ item search results) from crowding
 * out older messages in the sliding memory window.
 *
 * IMPORTANT: The threshold is set high enough that typical task/user search
 * results (10-15 items) pass through uncompressed. The LLM needs the full
 * result to present readable lists to users.
 */

const TOKEN_CHAR_THRESHOLD = 12_000; // ~3000 tokens — only compresses very large payloads
const MIN_ITEMS_TO_COMPRESS = 15; // Never compress arrays with fewer items

export interface CompressedResult {
  __compressed: true;
  itemCount: number;
  /** First 10 items preserved in full for immediate reasoning. */
  head: unknown[];
  /** IDs of remaining items for reference without full payloads. */
  tailIds: string[];
  /** One-line summary of the full result set. */
  summary: string;
}

function extractId(item: unknown): string | null {
  if (!item || typeof item !== 'object') return null;
  const obj = item as Record<string, unknown>;
  if (typeof obj.id === 'string') return obj.id;
  if (typeof obj.taskId === 'string') return obj.taskId;
  if (typeof obj.userId === 'string') return obj.userId;
  if (typeof obj.task_id === 'string') return obj.task_id;
  if (typeof obj.user_id === 'string') return obj.user_id;
  return null;
}

/**
 * Compress a tool result if it exceeds the threshold. Returns the original
 * result unchanged if it's small enough or not an array-based structure.
 */
export function compressToolResult<T>(result: T): T | CompressedResult {
  const serialized = JSON.stringify(result);
  if (serialized.length <= TOKEN_CHAR_THRESHOLD) return result;

  // Only compress array results or objects with an `items` / `results` array
  let items: unknown[] | null = null;
  let wrapper: Record<string, unknown> | null = null;

  if (Array.isArray(result)) {
    items = result;
  } else if (result && typeof result === 'object') {
    const obj = result as Record<string, unknown>;
    if (Array.isArray(obj.items)) {
      items = obj.items;
      wrapper = obj;
    } else if (Array.isArray(obj.results)) {
      items = obj.results;
      wrapper = obj;
    } else if (Array.isArray(obj.tasks)) {
      items = obj.tasks;
      wrapper = obj;
    } else if (Array.isArray(obj.users)) {
      items = obj.users;
      wrapper = obj;
    }
  }

  if (!items || items.length <= MIN_ITEMS_TO_COMPRESS) return result;

  const head = items.slice(0, 10);
  const tail = items.slice(10);
  const tailIds = tail.map(extractId).filter((id): id is string => id !== null);

  const compressed: CompressedResult = {
    __compressed: true,
    itemCount: items.length,
    head,
    tailIds,
    summary: `${items.length} items total. First 10 shown in full; ${tailIds.length} additional IDs available for lookup.`,
  };

  // If there was a wrapper with extra metadata, preserve non-array fields
  if (wrapper) {
    const meta: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(wrapper)) {
      if (!Array.isArray(val)) meta[key] = val;
    }
    if (Object.keys(meta).length > 0) {
      return { ...compressed, meta } as unknown as CompressedResult;
    }
  }

  return compressed;
}
