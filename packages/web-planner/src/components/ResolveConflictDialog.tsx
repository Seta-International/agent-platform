import {
  Banner,
  Button,
  Dialog,
  DialogHeader,
  FieldConflictRow,
  Layout,
  LayoutContent,
  LayoutFooter,
} from '@seta/shared-ui';
import { useState } from 'react';
import { useResolveGroupConflict } from '../hooks/mutations/resolve-group-conflict';

interface ConflictField {
  field: string;
  localValue: string;
  remoteValue: string;
}

interface Props {
  groupId: string;
  conflictFields: ConflictField[];
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onResolved?: () => void;
}

export function ResolveConflictDialog({
  groupId,
  conflictFields,
  open,
  onOpenChange,
  onResolved,
}: Props) {
  const [decisions, setDecisions] = useState<Record<string, 'local' | 'remote'>>({});
  const resolve = useResolveGroupConflict(groupId);

  function handleOpenChange(v: boolean) {
    if (!v) {
      setDecisions({});
      resolve.reset();
    }
    onOpenChange(v);
  }

  const allDecided =
    conflictFields.length > 0 && conflictFields.every((f) => decisions[f.field] !== undefined);

  function handleResolve() {
    if (!allDecided) return;
    const payload = Object.entries(decisions).map(([field, choice]) => ({ field, choice }));
    resolve.mutate(payload, {
      onSuccess: () => {
        onResolved?.();
        onOpenChange(false);
      },
    });
  }

  return (
    <Dialog isOpen={open} onOpenChange={handleOpenChange} width={560} purpose="form">
      <Layout
        header={<DialogHeader title="Pick which version to keep" onOpenChange={handleOpenChange} />}
        content={
          <LayoutContent>
            <div className="space-y-5">
              {conflictFields.length === 0 ? (
                <p className="text-sm text-ink-subtle">
                  Details aren&apos;t ready yet. Refresh the sync and try again.
                </p>
              ) : (
                conflictFields.map((cf) => (
                  <FieldConflictRow
                    key={cf.field}
                    field={cf.field}
                    local={cf.localValue}
                    remote={cf.remoteValue}
                    choice={decisions[cf.field] ?? null}
                    onChoose={(c) => setDecisions((prev) => ({ ...prev, [cf.field]: c }))}
                  />
                ))
              )}
            </div>

            {resolve.isError && (
              <Banner
                status="error"
                title={
                  resolve.error instanceof Error
                    ? resolve.error.message
                    : "Couldn't save your choice."
                }
              />
            )}
          </LayoutContent>
        }
        footer={
          <LayoutFooter hasDivider>
            <div className="flex w-full justify-end">
              <Button
                label="Save choices"
                onClick={handleResolve}
                isDisabled={!allDecided || resolve.isPending}
              />
            </div>
          </LayoutFooter>
        }
      />
    </Dialog>
  );
}
