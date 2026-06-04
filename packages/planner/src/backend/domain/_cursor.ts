/**
 * Opaque keyset cursor for task list pagination, ordered by
 * (updated_at DESC, id DESC). Base64 of {u: updated_at ISO, i: task id}.
 * Used by listTasks; will also be used by listPlanTasksByDateRange once it
 * gains cursor pagination, so format changes happen in exactly one place.
 */
export function encodeCursor(updatedAt: string, id: string): string {
  return Buffer.from(JSON.stringify({ u: updatedAt, i: id })).toString('base64');
}

export function decodeCursor(c: string): { u: string; i: string } | null {
  try {
    const parsed = JSON.parse(Buffer.from(c, 'base64').toString('utf-8')) as unknown;
    if (
      typeof (parsed as { u?: unknown }).u !== 'string' ||
      typeof (parsed as { i?: unknown }).i !== 'string'
    )
      return null;
    return parsed as { u: string; i: string };
  } catch {
    return null;
  }
}
