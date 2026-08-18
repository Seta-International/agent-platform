// packages/planner/tests/fixtures/golden/action/preview-store.ts
//
// The in-process stand-in for `PreviewPort` (design D1).
//
// The real one lives in `apps/server` because the approval rows are in the
// `agent` schema, which planner may not read (`pnpm lint:raw-sql`) and whose
// package planner may not import (`@seta/agent` → `@seta/planner` already, so the
// reverse edge is a cycle `no-circular` rejects, tests included).
//
// What this DOES model: which cards are open, and what dedup keys they hold.
// What it deliberately does NOT model: supersede atomicity, the advisory lock,
// stale-card rejection, the 72-hour TTL. Those are pinned deterministically and
// without a model by FUT-840 ⑤ in `apps/server`; a passing case here is never
// evidence about them.
import { randomUUID } from 'node:crypto';
import type {
  LoadedPreview,
  PreviewPort,
} from '../../../../src/backend/orchestration/action/ports.ts';

interface CardLike {
  intent: string;
  primary: { argsPatch?: Record<string, unknown> };
  meta: { toolId: string; dedupKeys?: string[] };
}

interface Entry {
  approvalId: string;
  card: CardLike;
  decided: boolean;
}

export class ActionPreviewStore {
  private readonly entries = new Map<string, Entry>();

  /** Records a card the agent just suspended on, minting the id the SERVER would
   *  have minted. The model never sees or sends it — that separation is D20. */
  open(card: CardLike): string {
    const approvalId = randomUUID();
    this.entries.set(approvalId, { approvalId, card, decided: false });
    return approvalId;
  }

  /** Confirm or decline: either way the card stops being open. */
  decide(approvalId: string): void {
    const e = this.entries.get(approvalId);
    if (e) e.decided = true;
  }

  /** Supersede, as the real writer performs it inside the read-model write: the
   *  previous card retires when the new one appears. */
  supersede(previousApprovalId: string, card: CardLike): string {
    this.decide(previousApprovalId);
    return this.open(card);
  }

  openCount(): number {
    return this.openEntries().length;
  }

  openEntries(): Entry[] {
    return [...this.entries.values()].filter((e) => !e.decided);
  }

  reset(): void {
    this.entries.clear();
  }

  /** The two-method port the tools receive. */
  readonly port: PreviewPort = {
    loadPreview: async ({ approvalId }): Promise<LoadedPreview | null> => {
      const e = this.entries.get(approvalId);
      if (!e || e.decided) return null;
      return {
        approvalId: e.approvalId,
        toolId: e.card.meta.toolId,
        argsPatch: e.card.primary.argsPatch ?? {},
      };
    },
    takenDedupKeys: async ({ dedupKeys }): Promise<string[]> => {
      const taken = new Set(this.openEntries().flatMap((e) => e.card.meta.dedupKeys ?? []));
      return dedupKeys.filter((k) => taken.has(k));
    },
  };
}
