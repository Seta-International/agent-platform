import { Skeleton } from '@seta/shared-ui';

/**
 * Placeholder shown while a thread's history is fetched before the runtime can
 * mount (see AgentRuntimeHost). Mirrors the real layout — h-12 header with its
 * divider over a 45rem transcript column — so switching threads reads as one
 * chat loading in place rather than the page blanking to a "Loading…" label.
 */
export function ChatSkeleton() {
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <div className="flex h-12 flex-none items-center border-b border-border px-4">
        <div className="mx-auto flex w-full max-w-[45rem] items-center justify-between">
          <Skeleton width={168} height={14} radius={1} index={0} />
          <Skeleton width={52} height={20} radius={2} index={1} />
        </div>
      </div>
      <div className="mx-auto flex w-full max-w-[45rem] flex-1 flex-col gap-8 px-4 py-8">
        <div className="flex flex-col gap-2.5">
          <Skeleton width={52} height={12} radius={1} index={2} />
          <Skeleton width="86%" height={12} radius={1} index={3} />
          <Skeleton width="68%" height={12} radius={1} index={4} />
        </div>
        <div className="flex justify-end">
          <Skeleton width="42%" height={40} radius={3} index={5} />
        </div>
        <div className="flex flex-col gap-2.5">
          <Skeleton width={52} height={12} radius={1} index={6} />
          <Skeleton width="92%" height={12} radius={1} index={7} />
          <Skeleton width="74%" height={12} radius={1} index={8} />
          <Skeleton width="58%" height={12} radius={1} index={9} />
        </div>
      </div>
    </div>
  );
}
