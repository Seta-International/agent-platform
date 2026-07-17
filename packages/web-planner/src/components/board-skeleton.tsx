import { Skeleton } from '@seta/shared-ui';

export function BoardSkeleton() {
  return (
    <div className="flex gap-4 px-6 py-4" data-testid="board-skeleton" aria-busy="true">
      {Array.from({ length: 4 }).map((_, ci) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: skeleton columns have no semantic identity
          key={ci}
          className="flex flex-[0_0_280px] flex-col gap-2"
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
    <div className="flex flex-col gap-2 px-6 py-4" data-testid="grid-skeleton" aria-busy="true">
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
