import { Draggable, Droppable } from '@hello-pangea/dnd';
import { KanbanCard, type KanbanCardTask } from '@seta/shared-ui';
import type { ReactNode } from 'react';
import { useVirtualizedBucket } from '../hooks/use-virtualized-bucket';

export interface BucketCard {
  card: KanbanCardTask;
  previewSlot?: ReactNode;
}

interface Props {
  bucketId: string;
  cards: BucketCard[];
  onOpen: (taskId: string) => void;
}

export function VirtualizedBucketList({ bucketId, cards, onOpen }: Props) {
  const { parentRef, virtualizer } = useVirtualizedBucket({ count: cards.length });

  return (
    <Droppable
      droppableId={bucketId}
      type="TASK"
      mode="virtual"
      renderClone={(provided, snapshot, rubric) => {
        const entry = cards[rubric.source.index];
        if (!entry) return <div ref={provided.innerRef} {...provided.draggableProps} />;
        return (
          <KanbanCard
            task={entry.card}
            previewSlot={entry.previewSlot}
            draggable={{
              ref: provided.innerRef,
              rootProps: provided.draggableProps,
              handleProps: provided.dragHandleProps ?? undefined,
              isDragging: snapshot.isDragging,
              extraStyle: provided.draggableProps.style,
            }}
          />
        );
      }}
    >
      {(dp, ds) => (
        <div
          ref={(node) => {
            dp.innerRef(node);
            parentRef.current = node;
          }}
          {...dp.droppableProps}
          data-testid="virtualized-bucket-list"
          className={
            ds.isDraggingOver ? 'is-over virtualized-bucket-list' : 'virtualized-bucket-list'
          }
          // fixed scroll viewport — TanStack virtualizer needs a definite scroll-container height to compute the visible window
          style={{ maxHeight: '70vh', height: '100%', overflow: 'auto', position: 'relative' }}
        >
          {/* placeholder intentionally omitted — virtual mode; total height is provided by the spacer div above */}
          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              width: '100%',
              position: 'relative',
            }}
          >
            {virtualizer.getVirtualItems().map((vi) => {
              const entry = cards[vi.index];
              if (!entry) return null;
              return (
                <div
                  key={entry.card.id}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${vi.start}px)`,
                  }}
                >
                  <Draggable draggableId={entry.card.id} index={vi.index}>
                    {(dpc, dsc) => (
                      <KanbanCard
                        task={entry.card}
                        previewSlot={entry.previewSlot}
                        onOpen={() => onOpen(entry.card.id)}
                        draggable={{
                          ref: dpc.innerRef,
                          rootProps: dpc.draggableProps,
                          handleProps: dpc.dragHandleProps ?? undefined,
                          isDragging: dsc.isDragging,
                          extraStyle: dpc.draggableProps.style,
                        }}
                      />
                    )}
                  </Draggable>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Droppable>
  );
}
