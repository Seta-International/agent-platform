import { and, count, desc, eq, isNull, lt, or, sql } from 'drizzle-orm';
import { coreDb } from '../db/client.ts';
import { coreNotifications } from '../db/schema/notifications.ts';

export interface Notification {
  id: string;
  event_type: string;
  payload: Record<string, unknown>;
  created_at: string;
  read_at: string | null;
}

export interface ListNotificationsInput {
  userId: string;
  tenantId: string;
  limit: number;
  cursor?: string;
  unread?: boolean;
}

interface CursorParts {
  created_at: string;
  id: string;
}

function encodeCursor(c: CursorParts): string {
  return Buffer.from(JSON.stringify(c), 'utf8').toString('base64url');
}

function decodeCursor(s: string): CursorParts | null {
  try {
    const c = JSON.parse(Buffer.from(s, 'base64url').toString('utf8'));
    if (typeof c?.created_at === 'string' && typeof c?.id === 'string') return c;
  } catch {
    // malformed cursor — treat as absent
  }
  return null;
}

export async function listNotifications(input: ListNotificationsInput): Promise<{
  items: Notification[];
  next_cursor: string | null;
}> {
  const limit = Math.min(Math.max(input.limit, 1), 100);
  const cursor = input.cursor ? decodeCursor(input.cursor) : null;

  const whereParts = [
    eq(coreNotifications.userId, input.userId),
    eq(coreNotifications.tenantId, input.tenantId),
    isNull(coreNotifications.dismissedAt),
  ];
  if (input.unread) whereParts.push(isNull(coreNotifications.readAt));
  if (cursor) {
    const cursorTs = sql`${cursor.created_at}::timestamptz`;
    const cursorClause = or(
      lt(coreNotifications.createdAt, cursorTs),
      and(eq(coreNotifications.createdAt, cursorTs), lt(coreNotifications.id, cursor.id)),
    );
    if (cursorClause) whereParts.push(cursorClause);
  }

  const rows = await coreDb()
    .select({
      id: coreNotifications.id,
      eventType: coreNotifications.eventType,
      payload: coreNotifications.payload,
      createdAt: coreNotifications.createdAt,
      createdAtText: sql<string>`${coreNotifications.createdAt}::text`.as('created_at_text'),
      readAt: coreNotifications.readAt,
    })
    .from(coreNotifications)
    .where(and(...whereParts))
    .orderBy(desc(coreNotifications.createdAt), desc(coreNotifications.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  return {
    items: page.map((r) => ({
      id: r.id,
      event_type: r.eventType,
      payload: r.payload as Record<string, unknown>,
      created_at: r.createdAt.toISOString(),
      read_at: r.readAt ? r.readAt.toISOString() : null,
    })),
    next_cursor:
      hasMore && last ? encodeCursor({ created_at: last.createdAtText, id: last.id }) : null,
  };
}

export async function getUnreadCount(input: { userId: string; tenantId: string }): Promise<number> {
  const [row] = await coreDb()
    .select({ n: count() })
    .from(coreNotifications)
    .where(
      and(
        eq(coreNotifications.userId, input.userId),
        eq(coreNotifications.tenantId, input.tenantId),
        isNull(coreNotifications.readAt),
        isNull(coreNotifications.dismissedAt),
      ),
    );
  return Number(row?.n ?? 0);
}
