import {
  Banner,
  Button,
  cn,
  Dialog,
  DialogHeader,
  Input,
  Layout,
  LayoutContent,
  LayoutFooter,
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

  function handleDialogOpenChange(v: boolean) {
    if (!v) handleClose();
    else onOpenChange(true);
  }

  return (
    <Dialog isOpen={open} onOpenChange={handleDialogOpenChange} purpose="form" width={560}>
      <Layout
        header={
          <DialogHeader
            title="Link with a Microsoft 365 group"
            subtitle="Microsoft 365 will keep the name, description, visibility, color, and members in sync."
            onOpenChange={handleDialogOpenChange}
          />
        }
        content={
          <LayoutContent>
            <div className="space-y-3">
              <div className="relative">
                <Input
                  hasAutoFocus
                  label="Search Microsoft 365 groups"
                  isLabelHidden
                  placeholder="Search Microsoft 365 groups…"
                  value={query}
                  onChange={(value) => {
                    setQuery(value);
                    setSelectedId(null);
                  }}
                />
                {search.isFetching && (
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-secondary animate-pulse">
                    Searching…
                  </span>
                )}
              </div>

              {search.data && groups.length === 0 && (
                <p className="text-sm text-secondary px-1">No matching groups in Microsoft 365.</p>
              )}

              {groups.length > 0 && (
                <ul className="max-h-72 overflow-y-auto rounded-md border border-border divide-y divide-border">
                  {groups.map((g) => (
                    <li key={g.external_id}>
                      <button
                        type="button"
                        disabled={g.already_linked}
                        onClick={() => setSelectedId(g.external_id)}
                        className={cn(
                          'w-full px-3 py-2 text-left hover:bg-card',
                          selectedId === g.external_id && 'bg-accent-bg/10',
                          g.already_linked && 'cursor-not-allowed opacity-50 hover:bg-transparent',
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="font-medium text-sm">{g.display_name}</div>
                          {g.already_linked && (
                            <span className="rounded bg-surface px-1.5 py-0.5 text-xs text-secondary">
                              Already linked
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-secondary">{g.mail_nickname}</div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {link.isError && (
                <Banner
                  status="error"
                  title={
                    link.error instanceof Error ? link.error.message : "Couldn't link the group."
                  }
                />
              )}
            </div>
          </LayoutContent>
        }
        footer={
          <LayoutFooter hasDivider>
            <Button variant="secondary" label="Cancel" onClick={handleClose} />
            <Button
              label={link.isPending ? 'Linking…' : 'Link'}
              onClick={handleLink}
              isDisabled={!selectedId || link.isPending}
            />
          </LayoutFooter>
        }
      />
    </Dialog>
  );
}
