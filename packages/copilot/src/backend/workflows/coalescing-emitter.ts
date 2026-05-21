export interface CoalescingEmitterOpts<T> {
  windowMs: number;
  keyFn: (event: T) => string;
  emit: (event: T) => void | Promise<void>;
}

export class CoalescingEmitter<T> {
  private readonly pending = new Map<string, T>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;

  constructor(private readonly opts: CoalescingEmitterOpts<T>) {}

  push(event: T): void {
    if (this.disposed) return;
    this.pending.set(this.opts.keyFn(event), event);
    if (!this.timer) {
      this.timer = setTimeout(() => {
        void this.flush();
      }, this.opts.windowMs);
    }
  }

  private async flush(): Promise<void> {
    this.timer = null;
    if (this.disposed) return;
    const batch = Array.from(this.pending.values());
    this.pending.clear();
    for (const event of batch) {
      try {
        await this.opts.emit(event);
      } catch {
        // Swallow per-emit errors so one bad event doesn't kill the batch
      }
    }
  }

  dispose(): void {
    this.disposed = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.pending.clear();
  }
}
