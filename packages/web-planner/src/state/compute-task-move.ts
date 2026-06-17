interface CardLike {
  id: string;
}

interface ComputeTaskMoveInput<C extends CardLike> {
  draggableId: string;
  destinationIndex: number;
  destinationBucketId: string | null;
  /** Neighbours in the destination bucket, in render order, excluding the dragged task. */
  inTarget: ReadonlyArray<C>;
}

export interface TaskMovePayload {
  bucket_id: string | null;
  before_id: string | undefined;
  after_id: string | undefined;
}

/**
 * Resolve neighbour IDs for a drop event into the (before_id, after_id) pair that
 * planner.moveTask expects. Server-side, fractional-indexing.generateKeyBetween turns the
 * pair into the canonical order_hint; the client only forwards neighbours.
 *
 * Mirrors the bucket-reorder helper: prefer before_id (the neighbour that ends up after
 * the dropped card); fall back to after_id only when dropping at the tail.
 */
export function computeTaskMove<C extends CardLike>(
  input: ComputeTaskMoveInput<C>,
): TaskMovePayload {
  const { destinationIndex, destinationBucketId, inTarget } = input;
  const beforeNeighbour = inTarget[destinationIndex];
  const afterNeighbour = destinationIndex === 0 ? undefined : inTarget[destinationIndex - 1];
  return {
    bucket_id: destinationBucketId,
    before_id: beforeNeighbour?.id,
    after_id: beforeNeighbour ? undefined : afterNeighbour?.id,
  };
}
