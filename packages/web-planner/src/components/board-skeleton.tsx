import { Skeleton } from '@seta/shared-ui';

export function BoardSkeleton() {
  return (
    <div className="board-skeleton" data-testid="board-skeleton" aria-busy="true">
      {Array.from({ length: 4 }).map((_, ci) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: skeleton columns have no semantic identity
          key={ci}
          className="board-skeleton__column"
        >
          <Skeleton className="h-4 w-24" />
          {Array.from({ length: 3 }).map((__, ti) => (
            <Skeleton
              // biome-ignore lint/suspicious/noArrayIndexKey: skeleton rows have no semantic identity
              key={ti}
              className="h-16 w-full rounded-md"
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export function GridSkeleton() {
  return (
    <div className="grid-skeleton" data-testid="grid-skeleton" aria-busy="true">
      {Array.from({ length: 15 }).map((_, i) => (
        <Skeleton
          // biome-ignore lint/suspicious/noArrayIndexKey: skeleton rows have no semantic identity
          key={i}
          className="h-8 w-full"
        />
      ))}
    </div>
  );
}
