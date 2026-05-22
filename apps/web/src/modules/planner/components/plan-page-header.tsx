import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  SyncBadge,
  type SyncState,
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
  canManage?: boolean;
  onRename?: (name: string) => void;
  onArchive?: () => void;
  onDelete?: () => void;
  onExport?: () => void;
  external_source?: 'native' | 'm365';
  syncStatus?: SyncState | null;
  externalSyncedAt?: string | null;
  externalId?: string | null;
  conflictCount?: number | null;
  onRefreshSync?: () => void;
  onOpenConflictDialog?: () => void;
  onUnlinkFromM365?: () => void;
}

function m365PlanDeepLink(externalId: string): string {
  return `https://tasks.office.com/Home/Planner/#/plantaskboard?planId=${externalId}`;
}

export function PlanPageHeader({
  planName,
  groupName,
  groupId,
  bucketCount,
  taskCount,
  myTaskCount,
  canRename,
  canManage,
  onRename,
  onArchive,
  onDelete,
  onExport,
  external_source,
  syncStatus,
  externalSyncedAt,
  externalId,
  conflictCount,
  onRefreshSync,
  onOpenConflictDialog,
  onUnlinkFromM365,
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

  const isLinked = external_source === 'm365';
  const linkUrl = externalId ? m365PlanDeepLink(externalId) : undefined;
  const showRefresh = isLinked && Boolean(onRefreshSync);
  const showResolveConflicts =
    isLinked && syncStatus === 'conflict' && Boolean(onOpenConflictDialog);
  const showOpenInM365 = isLinked && Boolean(linkUrl);
  const showUnlink = isLinked && canManage === true && Boolean(onUnlinkFromM365);
  const hasSyncItems = showRefresh || showResolveConflicts || showOpenInM365 || showUnlink;
  const hasOverflow = Boolean(onArchive || onDelete || onExport) || hasSyncItems;

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
        {isLinked && (
          <SyncBadge
            state={syncStatus ?? null}
            synced_at={externalSyncedAt ?? null}
            linkUrl={linkUrl}
          />
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
              {showRefresh && (
                <DropdownMenuItem onSelect={onRefreshSync}>Refresh sync</DropdownMenuItem>
              )}
              {showResolveConflicts && (
                <DropdownMenuItem onSelect={onOpenConflictDialog}>
                  {conflictCount != null
                    ? `Resolve conflicts (${conflictCount})…`
                    : 'Resolve conflicts…'}
                </DropdownMenuItem>
              )}
              {showOpenInM365 && linkUrl && (
                <DropdownMenuItem asChild>
                  <a href={linkUrl} target="_blank" rel="noopener noreferrer">
                    Open in M365 Planner
                  </a>
                </DropdownMenuItem>
              )}
              {showUnlink && (
                <DropdownMenuItem onSelect={onUnlinkFromM365} className="text-semantic-danger">
                  Unlink from M365…
                </DropdownMenuItem>
              )}
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
