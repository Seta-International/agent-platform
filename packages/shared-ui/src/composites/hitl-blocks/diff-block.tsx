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
        <div className="mb-1 text-caption text-secondary">Before</div>
        <pre className="overflow-x-auto rounded bg-surface p-2 text-caption font-mono text-primary">
          {serialize(block.before)}
        </pre>
      </div>
      <div>
        <div className="mb-1 text-caption text-secondary">After</div>
        <pre className="overflow-x-auto rounded bg-surface p-2 text-caption font-mono text-primary">
          {serialize(block.after)}
        </pre>
      </div>
    </div>
  );
}
