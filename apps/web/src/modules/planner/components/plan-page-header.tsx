interface Props {
  planName: string;
  bucketCount: number;
  taskCount: number;
  canRename?: boolean;
  onRename?: (name: string) => void;
}

export function PlanPageHeader({ planName, bucketCount, taskCount, canRename, onRename }: Props) {
  return (
    <header className="plan-page-header">
      <h1
        contentEditable={canRename ? true : undefined}
        suppressContentEditableWarning
        onBlur={(e) => {
          if (canRename && onRename) {
            const next = (e.target as HTMLElement).innerText.trim();
            if (next && next !== planName) onRename(next);
          }
        }}
      >
        {planName}
      </h1>
      <p>
        {bucketCount} buckets · {taskCount} tasks
      </p>
    </header>
  );
}
