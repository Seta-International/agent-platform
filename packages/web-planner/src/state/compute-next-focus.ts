interface BucketStructure {
  buckets: Array<{ id: string; cardIds: string[] }>;
}

export function computeNextFocus(
  prev: string | null,
  dir: 'up' | 'down' | 'left' | 'right',
  s: BucketStructure,
): string | null {
  // If nothing focused, start at the first card of the first non-empty bucket.
  if (!prev) {
    for (const b of s.buckets) if (b.cardIds.length > 0) return b.cardIds[0] ?? null;
    return null;
  }
  // Build card-position index for O(1) lookup.
  const cardPos = new Map<string, { bIdx: number; cIdx: number }>();
  for (let i = 0; i < s.buckets.length; i++) {
    const bucket = s.buckets[i];
    if (!bucket) continue;
    for (let j = 0; j < bucket.cardIds.length; j++) {
      const id = bucket.cardIds[j];
      if (id !== undefined) cardPos.set(id, { bIdx: i, cIdx: j });
    }
  }

  const loc = cardPos.get(prev);
  if (!loc) return prev; // stale — keep focus
  const { bIdx, cIdx } = loc;

  const cards = s.buckets[bIdx]?.cardIds;
  if (!cards) return prev;
  switch (dir) {
    case 'down':
      return cards[Math.min(cIdx + 1, cards.length - 1)] ?? prev;
    case 'up':
      return cards[Math.max(cIdx - 1, 0)] ?? prev;
    case 'right': {
      // First card of the next non-empty bucket (no wrap).
      for (let i = bIdx + 1; i < s.buckets.length; i++) {
        const b = s.buckets[i];
        if (b && b.cardIds.length > 0) return b.cardIds[0] ?? prev;
      }
      return prev;
    }
    case 'left': {
      for (let i = bIdx - 1; i >= 0; i--) {
        const b = s.buckets[i];
        if (b && b.cardIds.length > 0) return b.cardIds[0] ?? prev;
      }
      return prev;
    }
  }
}
