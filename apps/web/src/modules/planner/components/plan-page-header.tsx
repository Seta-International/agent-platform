import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@seta/shared-ui';
import { Link } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';

interface Props {
  planName: string;
  groupName?: string;
  groupId?: string;
  bucketCount: number;
  taskCount: number;
  myTaskCount?: number;
  canRename?: boolean;
  onRename?: (name: string) => void;
  onArchive?: () => void;
  onDelete?: () => void;
  onExport?: () => void;
}

export function PlanPageHeader({
  planName,
  groupName,
  groupId,
  bucketCount,
  taskCount,
  myTaskCount,
  canRename,
  onRename,
  onArchive,
  onDelete,
  onExport,
}: Props) {
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  function commit() {
    if (!inputRef.current) return;
    const next = inputRef.current.value.trim();
    if (next && next !== planName && onRename) onRename(next);
    setEditing(false);
  }

  const hasOverflow = Boolean(onArchive || onDelete || onExport);

  return (
    <header className="plan-page-header">
      {groupName && (
        <nav aria-label="Breadcrumb" className="plan-page-header__breadcrumb">
          <Link to="/planner/groups">Planner</Link>
          <span aria-hidden="true">/</span>
          {groupId ? (
            <Link to="/planner/groups/$groupId" params={{ groupId }}>
              {groupName}
            </Link>
          ) : (
            <span>{groupName}</span>
          )}
          <span aria-hidden="true">/</span>
          <span aria-current="page">{planName}</span>
        </nav>
      )}
      <div className="plan-page-header__title-row">
        {canRename && editing ? (
          <input
            ref={inputRef}
            className="plan-page-header__rename"
            defaultValue={planName}
            aria-label="Rename plan"
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit();
              if (e.key === 'Escape') setEditing(false);
            }}
          />
        ) : (
          <h1>
            {canRename ? (
              <button
                type="button"
                className="plan-page-header__rename-trigger"
                onClick={() => setEditing(true)}
              >
                {planName}
              </button>
            ) : (
              planName
            )}
          </h1>
        )}
        {hasOverflow && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Plan actions"
                className="plan-page-header__overflow"
              >
                ⋯
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {onExport && <DropdownMenuItem onSelect={onExport}>Export</DropdownMenuItem>}
              {onArchive && <DropdownMenuItem onSelect={onArchive}>Archive</DropdownMenuItem>}
              {onDelete && (
                <DropdownMenuItem onSelect={onDelete} className="text-semantic-danger">
                  Delete
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      <p>
        {bucketCount} buckets · {taskCount} tasks
        {typeof myTaskCount === 'number' && <> · {myTaskCount} assigned to you</>}
      </p>
    </header>
  );
}
