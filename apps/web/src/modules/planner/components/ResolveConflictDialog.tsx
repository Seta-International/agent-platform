import {
  Alert,
  AlertDescription,
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Label,
  RadioGroup,
  RadioGroupItem,
} from '@seta/shared-ui';
import { useEffect, useState } from 'react';
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

  useEffect(() => {
    if (!open) {
      setDecisions({});
      resolve.reset();
    }
  }, [open, resolve.reset]);

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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Resolve sync conflict</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {conflictFields.length === 0 ? (
            <p className="text-sm text-ink-subtle">
              Conflict field details are not available. Use the "Refresh sync" action and reopen to
              see fields.
            </p>
          ) : (
            conflictFields.map((cf) => (
              <div key={cf.field} className="space-y-2">
                <p className="text-sm font-medium capitalize">{cf.field}</p>
                <RadioGroup
                  value={decisions[cf.field] ?? ''}
                  onValueChange={(v) =>
                    setDecisions((prev) => ({ ...prev, [cf.field]: v as 'local' | 'remote' }))
                  }
                >
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="local" id={`${cf.field}-local`} />
                    <Label htmlFor={`${cf.field}-local`}>
                      Keep local: <span className="text-ink-subtle">{cf.localValue}</span>
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="remote" id={`${cf.field}-remote`} />
                    <Label htmlFor={`${cf.field}-remote`}>
                      Use remote: <span className="text-ink-subtle">{cf.remoteValue}</span>
                    </Label>
                  </div>
                </RadioGroup>
              </div>
            ))
          )}
        </div>

        {resolve.isError && (
          <Alert variant="destructive">
            <AlertDescription>
              {resolve.error instanceof Error
                ? resolve.error.message
                : 'Failed to resolve conflict.'}
            </AlertDescription>
          </Alert>
        )}

        <div className="flex justify-end pt-2 border-t border-hairline mt-2">
          <Button onClick={handleResolve} disabled={!allDecided || resolve.isPending}>
            Resolve
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
