import {
  Alert,
  AlertDescription,
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
} from '@seta/shared-ui';
import { useState } from 'react';
import { useUpdateGroup } from '../hooks/mutations/update-group';

interface Props {
  groupId: string;
  currentName: string;
  version: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface FormProps {
  groupId: string;
  currentName: string;
  version: number;
  onDone: () => void;
}

function RenameForm({ groupId, currentName, version, onDone }: FormProps) {
  const updateGroup = useUpdateGroup(groupId);
  const [name, setName] = useState(currentName);
  const [error, setError] = useState<string | null>(null);

  function submit() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Give your group a name.');
      return;
    }
    if (trimmed === currentName) {
      onDone();
      return;
    }
    updateGroup.mutate(
      { expected_version: version, patch: { name: trimmed } },
      {
        onSuccess: () => onDone(),
        onError: (e) => setError(e instanceof Error ? e.message : "Couldn't rename the group."),
      },
    );
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label htmlFor="rename-group-name">Name</Label>
        <Input
          id="rename-group-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
          }}
        />
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button onClick={submit} disabled={!name.trim() || name.trim() === currentName}>
          Save
        </Button>
      </div>
    </div>
  );
}

export function RenameGroupDialog({ groupId, currentName, version, open, onOpenChange }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename group</DialogTitle>
        </DialogHeader>
        {open && (
          <RenameForm
            groupId={groupId}
            currentName={currentName}
            version={version}
            onDone={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
