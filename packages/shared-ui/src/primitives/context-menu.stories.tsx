import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from './context-menu';

const meta: Meta = { title: 'primitives/ContextMenu' };
export default meta;
type Story = StoryObj;

export const Default: Story = {
  render: () => (
    <ContextMenu>
      <ContextMenuTrigger className="flex h-24 w-64 items-center justify-center rounded-md border border-dashed border-hairline text-body-sm text-ink-subtle select-none cursor-default">
        Right-click here
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuLabel>Task</ContextMenuLabel>
        <ContextMenuGroup>
          <ContextMenuItem>
            Open
            <ContextMenuShortcut>↵</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuItem>
            Edit
            <ContextMenuShortcut>⌘E</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuItem>Duplicate</ContextMenuItem>
        </ContextMenuGroup>
        <ContextMenuSeparator />
        <ContextMenuGroup>
          <ContextMenuSub>
            <ContextMenuSubTrigger>Assign to</ContextMenuSubTrigger>
            <ContextMenuSubContent>
              <ContextMenuItem>Alice</ContextMenuItem>
              <ContextMenuItem>Bob</ContextMenuItem>
              <ContextMenuItem>Charlie</ContextMenuItem>
            </ContextMenuSubContent>
          </ContextMenuSub>
          <ContextMenuSub>
            <ContextMenuSubTrigger>Move to</ContextMenuSubTrigger>
            <ContextMenuSubContent>
              <ContextMenuItem>To do</ContextMenuItem>
              <ContextMenuItem>In progress</ContextMenuItem>
              <ContextMenuItem>Done</ContextMenuItem>
            </ContextMenuSubContent>
          </ContextMenuSub>
        </ContextMenuGroup>
        <ContextMenuSeparator />
        <ContextMenuItem className="text-semantic-error focus:text-semantic-error">
          Delete
          <ContextMenuShortcut>⌫</ContextMenuShortcut>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  ),
};

export const WithCheckboxAndRadio: Story = {
  render: () => (
    <ContextMenu>
      <ContextMenuTrigger className="flex h-24 w-64 items-center justify-center rounded-md border border-dashed border-hairline text-body-sm text-ink-subtle select-none cursor-default">
        Right-click for view options
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuLabel>View</ContextMenuLabel>
        <ContextMenuCheckboxItem checked>Show subtasks</ContextMenuCheckboxItem>
        <ContextMenuCheckboxItem>Show completed</ContextMenuCheckboxItem>
        <ContextMenuSeparator />
        <ContextMenuLabel>Group by</ContextMenuLabel>
        <ContextMenuRadioGroup value="assignee">
          <ContextMenuRadioItem value="assignee">Assignee</ContextMenuRadioItem>
          <ContextMenuRadioItem value="priority">Priority</ContextMenuRadioItem>
          <ContextMenuRadioItem value="none">None</ContextMenuRadioItem>
        </ContextMenuRadioGroup>
      </ContextMenuContent>
    </ContextMenu>
  ),
};
