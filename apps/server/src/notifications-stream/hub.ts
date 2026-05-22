import type { Pool, PoolClient } from 'pg';

export interface NotificationConnection {
  id: string;
  userId: string;
  send: () => void;
  close: () => void;
}

export class NotificationStreamHub {
  private connections = new Map<string, NotificationConnection>();
  private byUser = new Map<string, Set<string>>();
  private listener: PoolClient | null = null;

  async start(pool: Pool): Promise<void> {
    this.listener = await pool.connect();
    await this.listener.query('LISTEN core_notifications');
    this.listener.on('notification', (msg) => {
      if (msg.channel === 'core_notifications' && msg.payload) this.fanOut(msg.payload);
    });
    this.listener.on('error', () => {
      // listener errors during shutdown are not actionable here.
    });
  }

  async stop(): Promise<void> {
    if (this.listener) {
      try {
        this.listener.removeAllListeners('notification');
        await this.listener.query('UNLISTEN core_notifications');
      } catch {
        // best-effort
      }
      try {
        this.listener.release();
      } catch {
        // best-effort
      }
      this.listener = null;
    }
    for (const c of this.connections.values()) c.close();
    this.connections.clear();
    this.byUser.clear();
  }

  register(c: NotificationConnection): void {
    this.connections.set(c.id, c);
    let set = this.byUser.get(c.userId);
    if (!set) {
      set = new Set();
      this.byUser.set(c.userId, set);
    }
    set.add(c.id);
  }

  unregister(id: string): void {
    const c = this.connections.get(id);
    if (!c) return;
    this.connections.delete(id);
    const set = this.byUser.get(c.userId);
    if (set) {
      set.delete(id);
      if (set.size === 0) this.byUser.delete(c.userId);
    }
  }

  fanOut(userId: string): void {
    const set = this.byUser.get(userId);
    if (!set) return;
    for (const id of set) {
      const c = this.connections.get(id);
      if (c) {
        try {
          c.send();
        } catch {
          // a single misbehaving connection must not stop fan-out.
        }
      }
    }
  }

  connectionCount(): number {
    return this.connections.size;
  }
}
