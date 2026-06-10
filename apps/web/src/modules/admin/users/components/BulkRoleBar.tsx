import { Button } from '@seta/shared-ui';
import { useState } from 'react';
import { BulkRoleDialog } from './BulkRoleDialog.tsx';

export function BulkRoleBar({
  selected,
  onClear,
  onDone,
}: {
  selected: Set<string>;
  onClear: () => void;
  onDone: () => void;
}) {
  const [action, setAction] = useState<'grant' | 'revoke' | null>(null);
  const userIds = [...selected];

  return (
    <div className="sticky bottom-4 z-20 flex items-center gap-3 rounded-lg border border-hairline bg-surface-3 px-4 py-2.5 shadow-lg">
      <span className="text-sm font-medium">{selected.size} selected</span>
      <div className="ml-auto flex items-center gap-2">
        <Button size="sm" onClick={() => setAction('grant')}>
          Assign role
        </Button>
        <Button size="sm" variant="secondary" onClick={() => setAction('revoke')}>
          Remove role
        </Button>
        <Button size="sm" variant="ghost" onClick={onClear}>
          Clear
        </Button>
      </div>
      {action && (
        <BulkRoleDialog
          action={action}
          userIds={userIds}
          open={action !== null}
          onOpenChange={(open) => {
            if (!open) setAction(null);
          }}
          onDone={onDone}
        />
      )}
    </div>
  );
}
