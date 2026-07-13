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
          <Skeleton height={16} width={96} />
          {Array.from({ length: 3 }).map((__, ti) => (
            <Skeleton
              // biome-ignore lint/suspicious/noArrayIndexKey: skeleton rows have no semantic identity
              key={ti}
              height={64}
              radius={2}
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
          height={32}
        />
      ))}
    </div>
  );
}
