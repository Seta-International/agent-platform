import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  Label,
  Textarea,
} from '@seta/shared-ui';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useCreateGroup } from '../hooks/useGroups.ts';

const slugify = (s: string) =>
  s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

export function CreateGroupDialog({ onCreated }: { onCreated?: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugDirty, setSlugDirty] = useState(false);
  const [description, setDescription] = useState('');
  const createGroup = useCreateGroup();

  const effectiveSlug = slugDirty ? slug : slugify(name);

  const reset = () => {
    setName('');
    setSlug('');
    setSlugDirty(false);
    setDescription('');
  };

  const handleSubmit = () => {
    if (!effectiveSlug || !name.trim()) return;
    createGroup.mutate(
      { slug: effectiveSlug, name: name.trim(), description: description.trim() || undefined },
      {
        onSuccess: (res) => {
          setOpen(false);
          reset();
          onCreated?.(res.group_id);
        },
      },
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="size-4" aria-hidden />
          New group
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create group</DialogTitle>
          <DialogDescription>
            Groups bundle roles and members. Assign people to a group instead of granting roles one
            by one.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 pt-1">
          <div className="space-y-1.5">
            <Label htmlFor="group-name">Name</Label>
            <Input
              id="group-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="HR Team"
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="group-slug">Slug</Label>
            <Input
              id="group-slug"
              value={effectiveSlug}
              onChange={(e) => {
                setSlugDirty(true);
                setSlug(slugify(e.target.value));
              }}
              placeholder="hr-team"
              className="font-mono text-body-sm"
            />
            <p className="text-caption text-ink-tertiary">
              A stable identifier. Lowercase letters, numbers, and hyphens.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="group-description">Description</Label>
            <Textarea
              id="group-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What this group is for (optional)"
              rows={2}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!effectiveSlug || !name.trim() || createGroup.isPending}
            >
              {createGroup.isPending ? 'Creating…' : 'Create group'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
