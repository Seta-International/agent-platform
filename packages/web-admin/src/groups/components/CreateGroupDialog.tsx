import {
  Button,
  Dialog,
  DialogFooter,
  DialogHeader,
  Input,
  Layout,
  LayoutContent,
  Text,
  Textarea,
  VStack,
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
        variant="primary"
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
              <VStack gap={4} style={{ paddingTop: 'var(--spacing-1)' }}>
                <VStack gap={1.5}>
                  <Input
                    label="Name"
                    value={name}
                    onChange={(value) => setName(value)}
                    placeholder="HR Team"
                    hasAutoFocus
                  />
                </VStack>
                <VStack gap={1.5}>
                  <Input
                    label="Slug"
                    value={effectiveSlug}
                    onChange={(value) => {
                      setSlugDirty(true);
                      setSlug(slugify(value));
                    }}
                    placeholder="hr-team"
                    className="font-mono"
                  />
                  <Text type="supporting" color="disabled" display="block">
                    A stable identifier. Lowercase letters, numbers, and hyphens.
                  </Text>
                </VStack>
                <Textarea
                  label="Description"
                  value={description}
                  onChange={(value) => setDescription(value)}
                  placeholder="What this group is for (optional)"
                  rows={2}
                />
              </VStack>
            </LayoutContent>
          }
          footer={
            <DialogFooter>
              <Button variant="secondary" label="Cancel" onClick={() => setOpen(false)} />
              <Button
                variant="primary"
                icon={<Plus className="size-4" />}
                label={createGroup.isPending ? 'Creating…' : 'Create group'}
                onClick={handleSubmit}
                isDisabled={!effectiveSlug || !name.trim() || createGroup.isPending}
              />
            </DialogFooter>
          }
        />
      </Dialog>
    </>
  );
}
