import {
  Banner,
  Button,
  cn,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Input,
} from '@seta/shared-ui';
import { useState } from 'react';
import { useLinkGroupToM365 } from '../hooks/mutations/link-group-to-m365';
import { useM365GroupSearch } from '../hooks/queries/use-m365-group-search';

interface Props {
  /** Existing group to link directly. Omit when used as a selection-only picker. */
  groupId?: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /**
   * Selection-only mode: instead of linking immediately, return the chosen M365
   * group to the caller (e.g. the New-group dialog, which defers create+link to
   * the "Create group" action so nothing is created until then).
   */
  onSelect?: (group: {
    external_id: string;
    display_name: string;
    description: string | null;
  }) => void;
}

export function LinkToM365Dialog({ groupId, open, onOpenChange, onSelect }: Props) {
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const search = useM365GroupSearch(query);
  const link = useLinkGroupToM365(groupId ?? '');

  function reset() {
    setQuery('');
    setSelectedId(null);
    link.reset();
  }

  function handleClose() {
    reset();
    onOpenChange(false);
  }

  function handleLink() {
    if (!selectedId) return;
    if (onSelect) {
      const g = groups.find((x) => x.external_id === selectedId);
      if (g)
        onSelect({
          external_id: g.external_id,
          display_name: g.display_name,
          description: g.description ?? null,
        });
      reset();
      onOpenChange(false);
      return;
    }
    link.mutate(selectedId, {
      onSuccess: () => {
        reset();
        onOpenChange(false);
      },
    });
  }

  const groups = search.data?.groups ?? [];

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) handleClose();
        else onOpenChange(true);
      }}
    >
      <DialogContent className="max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Link with a Microsoft 365 group</DialogTitle>
          <p className="mt-1 text-sm text-ink-subtle">
            Microsoft 365 will keep the name, description, visibility, color, and members in sync.
          </p>
        </DialogHeader>

        <div className="space-y-3">
          <div className="relative">
            <Input
              autoFocus
              placeholder="Search Microsoft 365 groups…"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSelectedId(null);
              }}
            />
            {search.isFetching && (
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-ink-muted animate-pulse">
                Searching…
              </span>
            )}
          </div>

          {search.data && groups.length === 0 && (
            <p className="text-sm text-ink-subtle px-1">No matching groups in Microsoft 365.</p>
          )}

          {groups.length > 0 && (
            <ul className="max-h-72 overflow-y-auto rounded-md border border-hairline divide-y divide-hairline">
              {groups.map((g) => (
                <li key={g.external_id}>
                  <button
                    type="button"
                    disabled={g.already_linked}
                    onClick={() => setSelectedId(g.external_id)}
                    className={cn(
                      'w-full px-3 py-2 text-left hover:bg-surface-1',
                      selectedId === g.external_id && 'bg-primary/10',
                      g.already_linked && 'cursor-not-allowed opacity-50 hover:bg-transparent',
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-medium text-sm">{g.display_name}</div>
                      {g.already_linked && (
                        <span className="rounded bg-surface-2 px-1.5 py-0.5 text-xs text-ink-muted">
                          Already linked
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-ink-muted">{g.mail_nickname}</div>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {link.isError && (
            <Banner
              status="error"
              title={link.error instanceof Error ? link.error.message : "Couldn't link the group."}
            />
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-hairline mt-2">
          <Button variant="secondary" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={handleLink} disabled={!selectedId || link.isPending}>
            {link.isPending ? 'Linking…' : 'Link'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
