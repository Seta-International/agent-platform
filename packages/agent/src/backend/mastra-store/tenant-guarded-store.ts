// The only module allowed to reach into Mastra's shared storage
// (mastra_threads / mastra_messages / ...) on behalf of chat/thread routes.
// Every method here builds the composite `${tenantId}:${userId}` resourceId
// and performs the ownership comparison internally — callers never build or
// compare a raw resourceId themselves. Enforced by scripts/lint-mastra-access.mjs.
import {
  getMemoryStore,
  type MastraStoredMessage,
  type MemoryStore,
  type ThreadRow,
} from '../routes/_shared.ts';

function resourceIdFor(tenantId: string, userId: string): string {
  return `${tenantId}:${userId}`;
}

export type NewMessageInput = {
  id: string;
  threadId: string;
  role: 'user' | 'assistant';
  createdAt: Date;
  content: unknown;
};

export type TenantMessage = NewMessageInput & { resourceId: string };

export type EnsureThreadResult =
  | { kind: 'unavailable' }
  | { kind: 'forbidden' }
  | { kind: 'ok'; thread: ThreadRow; created: boolean };

export class TenantGuardedMastraStore {
  readonly #mastra: unknown;

  constructor(mastra: unknown) {
    this.#mastra = mastra;
  }

  #store(): MemoryStore | null {
    return getMemoryStore(this.#mastra);
  }

  /** True when the underlying Mastra memory store is wired up. */
  isConfigured(): boolean {
    return this.#store() !== null;
  }

  async listThreadsForUser(tenantId: string, userId: string): Promise<{ threads: ThreadRow[] }> {
    const store = this.#store();
    if (!store) return { threads: [] };
    return store.listThreads({
      filter: { resourceId: resourceIdFor(tenantId, userId) },
      perPage: 100,
    });
  }

  /**
   * Returns the thread iff it exists AND is owned by (tenantId, userId);
   * null for both "doesn't exist" and "belongs to someone else" — callers
   * map null to 404, matching the pre-refactor inline guard exactly (no 403
   * leak of foreign-thread existence).
   */
  async getThreadChecked(
    tenantId: string,
    userId: string,
    threadId: string,
  ): Promise<ThreadRow | null> {
    const store = this.#store();
    const thread = store ? await store.getThreadById({ threadId }) : null;
    if (!thread || thread.resourceId !== resourceIdFor(tenantId, userId)) return null;
    return thread;
  }

  async listThreadMessages(
    threadId: string,
    opts: { page: number; perPage: number },
  ): Promise<{ messages: MastraStoredMessage[]; total?: number; hasMore?: boolean }> {
    const store = this.#store();
    if (!store) return { messages: [], total: 0, hasMore: false };
    return store.listMessages({ threadId, page: opts.page, perPage: opts.perPage });
  }

  async updateThread(
    threadId: string,
    opts: { title: string; metadata: Record<string, unknown> },
  ): Promise<ThreadRow | null> {
    const store = this.#store();
    if (!store) return null;
    return store.updateThread({ id: threadId, title: opts.title, metadata: opts.metadata });
  }

  async deleteThread(threadId: string): Promise<void> {
    const store = this.#store();
    if (!store) return;
    await store.deleteThread({ threadId });
  }

  /**
   * Create-on-first-write for the chat route: fetches the thread, reports
   * 'forbidden' if it exists under another owner, else creates it if absent.
   * Ensures a GET on the returned threadId never 404s mid-stream.
   */
  async ensureThreadForUser(
    tenantId: string,
    userId: string,
    thread: {
      id: string;
      title: string;
      createdAt: Date;
      updatedAt: Date;
      metadata: Record<string, unknown>;
    },
  ): Promise<EnsureThreadResult> {
    const store = this.#store();
    if (!store) return { kind: 'unavailable' };
    const resourceId = resourceIdFor(tenantId, userId);
    const existing = await store.getThreadById({ threadId: thread.id });
    if (existing && existing.resourceId !== resourceId) return { kind: 'forbidden' };
    if (existing) return { kind: 'ok', thread: existing, created: false };
    const saved = await store.saveThread({
      thread: {
        id: thread.id,
        resourceId,
        title: thread.title,
        createdAt: thread.createdAt,
        updatedAt: thread.updatedAt,
        metadata: thread.metadata,
      },
    });
    return { kind: 'ok', thread: saved, created: true };
  }

  /** Stamps the composite resourceId onto a new message row. Pure, no I/O. */
  buildMessage(tenantId: string, userId: string, input: NewMessageInput): TenantMessage {
    return { ...input, resourceId: resourceIdFor(tenantId, userId) };
  }

  async saveMessages(messages: TenantMessage[]): Promise<void> {
    const store = this.#store();
    if (!store) return;
    await store.saveMessages({ messages });
  }
}
