import type { BlockProps } from './types';

function serialize(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function DiffBlock({ block }: BlockProps) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <div>
        <div className="mb-1 text-caption text-ink-subtle">Before</div>
        <pre className="overflow-x-auto rounded bg-surface-2 p-2 text-caption font-mono text-ink">
          {serialize(block.before)}
        </pre>
      </div>
      <div>
        <div className="mb-1 text-caption text-ink-subtle">After</div>
        <pre className="overflow-x-auto rounded bg-surface-2 p-2 text-caption font-mono text-ink">
          {serialize(block.after)}
        </pre>
      </div>
    </div>
  );
}
