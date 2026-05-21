import { describe, expect, it } from 'vitest';
import { computeTaskMove } from './compute-task-move';

const t = (id: string) => ({ id });

describe('computeTaskMove', () => {
  it('returns before_id=firstId when dropping at the head of a bucket', () => {
    const result = computeTaskMove({
      draggableId: 't3',
      destinationIndex: 0,
      destinationBucketId: 'b1',
      inTarget: [t('t1'), t('t2')],
    });
    expect(result).toEqual({
      bucket_id: 'b1',
      before_id: 't1',
      after_id: undefined,
    });
  });

  it('returns before_id of the neighbour at destinationIndex when dropping between siblings', () => {
    const result = computeTaskMove({
      draggableId: 't3',
      destinationIndex: 1,
      destinationBucketId: 'b1',
      inTarget: [t('t1'), t('t2')],
    });
    expect(result).toEqual({
      bucket_id: 'b1',
      before_id: 't2',
      after_id: undefined,
    });
  });

  it('returns after_id of the last neighbour when dropping at the tail of a bucket', () => {
    const result = computeTaskMove({
      draggableId: 't3',
      destinationIndex: 2,
      destinationBucketId: 'b1',
      inTarget: [t('t1'), t('t2')],
    });
    expect(result).toEqual({
      bucket_id: 'b1',
      before_id: undefined,
      after_id: 't2',
    });
  });

  it('carries the target bucket id when dropping across buckets', () => {
    const result = computeTaskMove({
      draggableId: 't3',
      destinationIndex: 0,
      destinationBucketId: 'b2',
      inTarget: [t('t5')],
    });
    expect(result).toEqual({
      bucket_id: 'b2',
      before_id: 't5',
      after_id: undefined,
    });
  });

  it('drops into an empty target bucket as a plain append (no neighbours)', () => {
    const result = computeTaskMove({
      draggableId: 't3',
      destinationIndex: 0,
      destinationBucketId: 'b3',
      inTarget: [],
    });
    expect(result).toEqual({
      bucket_id: 'b3',
      before_id: undefined,
      after_id: undefined,
    });
  });

  it('respects null destinationBucketId (the unassigned column)', () => {
    const result = computeTaskMove({
      draggableId: 't3',
      destinationIndex: 0,
      destinationBucketId: null,
      inTarget: [t('t1')],
    });
    expect(result).toEqual({
      bucket_id: null,
      before_id: 't1',
      after_id: undefined,
    });
  });
});
