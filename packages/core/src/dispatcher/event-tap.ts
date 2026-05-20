import type { DomainEvent } from '@seta/shared-types';

export type EventTapPredicate = (event: DomainEvent) => boolean;
export type EventTapHandler = (event: DomainEvent) => void;

interface TapRegistration {
  id: number;
  predicate: EventTapPredicate;
  handler: EventTapHandler;
}

let nextId = 1;
const taps: TapRegistration[] = [];

export function addEventTap(predicate: EventTapPredicate, handler: EventTapHandler): () => void {
  const id = nextId++;
  taps.push({ id, predicate, handler });
  return () => {
    const idx = taps.findIndex((t) => t.id === id);
    if (idx >= 0) taps.splice(idx, 1);
  };
}

export function dispatchTap(event: DomainEvent): void {
  for (const tap of taps) {
    try {
      if (tap.predicate(event)) tap.handler(event);
    } catch (_err) {
      // Taps are best-effort. Drop errors so one bad tap doesn't kill others.
    }
  }
}

// For test-only cleanup.
export function _clearTapsForTest(): void {
  taps.length = 0;
  nextId = 1;
}
