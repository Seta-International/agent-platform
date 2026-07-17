import {
  Button,
  Dialog,
  DialogHeader,
  Input,
  Layout,
  LayoutContent,
  LayoutFooter,
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

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) reset();
  }

  return (
    <>
      <Button
        size="sm"
        label="New group"
        icon={<Plus className="size-4" aria-hidden />}
        onClick={() => setOpen(true)}
      />
      <Dialog isOpen={open} onOpenChange={handleOpenChange} purpose="form">
        <Layout
          header={
            <DialogHeader
              title="Create group"
              subtitle="Groups bundle roles and members. Assign people to a group instead of granting roles one by one."
              onOpenChange={handleOpenChange}
            />
          }
          content={
            <LayoutContent>
              <div className="space-y-4 pt-1">
                <div className="space-y-1.5">
                  <Input
                    label="Name"
                    value={name}
                    onChange={(value) => setName(value)}
                    placeholder="HR Team"
                    hasAutoFocus
                  />
                </div>
                <div className="space-y-1.5">
                  <Input
                    label="Slug"
                    value={effectiveSlug}
                    onChange={(value) => {
                      setSlugDirty(true);
                      setSlug(slugify(value));
                    }}
                    placeholder="hr-team"
                    className="font-mono text-base"
                  />
                  <p className="text-sm text-disabled">
                    A stable identifier. Lowercase letters, numbers, and hyphens.
                  </p>
                </div>
                <Textarea
                  label="Description"
                  value={description}
                  onChange={(value) => setDescription(value)}
                  placeholder="What this group is for (optional)"
                  rows={2}
                />
              </div>
            </LayoutContent>
          }
          footer={
            <LayoutFooter hasDivider>
              <Button variant="secondary" label="Cancel" onClick={() => setOpen(false)} />
              <Button
                label={createGroup.isPending ? 'Creating…' : 'Create group'}
                onClick={handleSubmit}
                isDisabled={!effectiveSlug || !name.trim() || createGroup.isPending}
              />
            </LayoutFooter>
          }
        />
      </Dialog>
    </>
  );
}
