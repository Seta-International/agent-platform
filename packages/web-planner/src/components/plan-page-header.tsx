import {
  BreadcrumbItem,
  Breadcrumbs,
  DropdownMenu,
  DropdownMenuItem,
  SyncBadge,
  type SyncState,
} from '@seta/shared-ui';
import {
  Archive,
  Copy,
  ExternalLink,
  Link as LinkIcon,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  RotateCcw,
  Unlink,
  X,
} from 'lucide-react';
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
  /** Gate the Duplicate/Archive/Delete menu items; when false the item is shown disabled. */
  canDuplicate?: boolean;
  canArchive?: boolean;
  canDelete?: boolean;
  onRename?: (name: string) => void;
  onDuplicate?: () => void;
  onCopyShareLink?: () => void;
  isArchived?: boolean;
  onArchive?: () => void;
  onRestore?: () => void;
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
  canDuplicate = true,
  canArchive = true,
  canDelete = true,
  onRename,
  onDuplicate,
  onCopyShareLink,
  isArchived,
  onArchive,
  onRestore,
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
  const [menuOpen, setMenuOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingRenameRef = useRef(false);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
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
  const hasOverflow =
    Boolean(onDuplicate || onCopyShareLink || onArchive || onRestore || onDelete || onExport) ||
    hasSyncItems;

  return (
    <header className="flex flex-col gap-1 px-6 pt-4 pb-2">
      {groupName && (
        <Breadcrumbs variant="supporting">
          <BreadcrumbItem href="/planner">Planner</BreadcrumbItem>
          {groupId ? (
            <BreadcrumbItem href={`/planner/groups/${groupId}`}>{groupName}</BreadcrumbItem>
          ) : (
            <BreadcrumbItem>{groupName}</BreadcrumbItem>
          )}
          <BreadcrumbItem isCurrent>{planName}</BreadcrumbItem>
        </Breadcrumbs>
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
          <h1 className="m-0 text-body-lg font-semibold leading-[1.3]">
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
          <DropdownMenu
            placement="below"
            isMenuOpen={menuOpen}
            onOpenChange={(open) => {
              setMenuOpen(open);
              // Astryx's DropdownMenu always returns focus to the trigger on close
              // (no onCloseAutoFocus escape hatch); defer to a microtask so our
              // rename-input focus wins the race against that internal call.
              if (!open && pendingRenameRef.current) {
                pendingRenameRef.current = false;
                queueMicrotask(() => {
                  inputRef.current?.focus();
                  inputRef.current?.select();
                });
              }
            }}
            hasChevron={false}
            button={{
              isIconOnly: true,
              icon: <MoreHorizontal className="size-4" />,
              variant: 'ghost',
              size: 'sm',
              label: 'Plan actions',
            }}
          >
            {onRename && (
              <DropdownMenuItem
                icon={<Pencil aria-hidden />}
                label="Rename plan"
                isDisabled={!canRename}
                onClick={() => {
                  pendingRenameRef.current = true;
                  setEditing(true);
                }}
              />
            )}
            {onDuplicate && (
              <DropdownMenuItem
                icon={<Copy aria-hidden />}
                label="Duplicate plan"
                isDisabled={!canDuplicate}
                onClick={onDuplicate}
              />
            )}
            {onCopyShareLink && (
              <DropdownMenuItem
                icon={<LinkIcon aria-hidden />}
                label="Copy share link"
                onClick={onCopyShareLink}
              />
            )}
            {showRefresh && (
              <DropdownMenuItem
                icon={<RefreshCw aria-hidden />}
                label="Sync now"
                onClick={onRefreshSync}
              />
            )}
            {showResolveConflicts && (
              <DropdownMenuItem
                icon={<RefreshCw aria-hidden />}
                label={
                  conflictCount != null ? `Review changes (${conflictCount})…` : 'Review changes…'
                }
                onClick={onOpenConflictDialog}
              />
            )}
            {showOpenInM365 && linkUrl && (
              // Astryx's DropdownMenuItem can't render as a link (no `asChild`/`href`); a real
              // anchor is required here so right-click/Cmd+click "open in new tab" still works.
              // useListFocus's keyboard nav only depends on `[role="menuitem"]`, not the tag name.
              <a
                href={linkUrl}
                target="_blank"
                rel="noopener noreferrer"
                role="menuitem"
                tabIndex={-1}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--spacing-xxs)',
                  padding: 'var(--spacing-xxs) var(--spacing-xs)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--color-ink)',
                  textDecoration: 'none',
                }}
              >
                <ExternalLink aria-hidden /> Open in Microsoft Planner
              </a>
            )}
            {showUnlink && (
              <DropdownMenuItem
                icon={<Unlink aria-hidden />}
                label="Unlink from Microsoft 365…"
                style={{ color: 'var(--color-danger)' }}
                onClick={onUnlinkFromM365}
              />
            )}
            {onExport && (
              <DropdownMenuItem
                icon={<ExternalLink aria-hidden />}
                label="Export"
                onClick={onExport}
              />
            )}
            {(onArchive || onRestore || onDelete) && (
              <hr
                aria-hidden
                style={{
                  height: 1,
                  margin: '4px 6px',
                  border: 'none',
                  backgroundColor: 'var(--color-hairline)',
                }}
              />
            )}
            {!isArchived && onArchive && (
              <DropdownMenuItem
                icon={<Archive aria-hidden />}
                label="Archive plan"
                isDisabled={!canArchive}
                onClick={onArchive}
              />
            )}
            {isArchived && onRestore && (
              <DropdownMenuItem
                icon={<RotateCcw aria-hidden />}
                label="Restore plan"
                onClick={onRestore}
              />
            )}
            {onDelete && (
              <DropdownMenuItem
                icon={<X aria-hidden />}
                label="Delete plan"
                style={{ color: 'var(--color-danger)' }}
                isDisabled={!canDelete}
                onClick={onDelete}
              />
            )}
          </DropdownMenu>
        )}
      </div>
      <p className="t-xs subtle mt-0.5 mb-0">
        {bucketCount} buckets · {taskCount} tasks
        {typeof myTaskCount === 'number' && <> · {myTaskCount} assigned to you</>}
      </p>
    </header>
  );
}
