import { ChatMessage as AstryxChatMessage } from '@astryxdesign/core/Chat';
import { Collapsible as AstryxCollapsible } from '@astryxdesign/core/Collapsible';
import { describe, expect, it } from 'vitest';
import * as Surface from '../../src/index';

const REQUIRED = [
  'Avatar',
  'Badge',
  'Banner',
  'Button',
  'Calendar',
  'Card',
  'ChatMessage',
  'Checkbox',
  'Collapsible',
  'DateInput',
  'Dialog',
  'DropdownMenu',
  'EmptyState',
  'Field',
  'InboxList',
  'Input',
  'NumberInput',
  'Pagination',
  'Popover',
  'Selector',
  'SetaLogo',
  'SetaMark',
  'SidePanel',
  'Skeleton',
  'Spinner',
  'Switch',
  'Tab',
  'TabList',
  'Table',
  'Textarea',
  'ThemeProvider',
  'ThemeToggle',
  'TimeInput',
  'ToastViewport',
  'Tokenizer',
  'Tooltip',
  'Typeahead',
  'cn',
  'createStaticSource',
  'cva',
  'useSeededItem',
  'useSeededItems',
  'useTheme',
  'useToast',
];

describe('@seta/shared-ui public surface', () => {
  it('exports every documented name', () => {
    const keys = new Set(Object.keys(Surface));
    const missing = REQUIRED.filter((name) => !keys.has(name));
    expect(missing).toEqual([]);
  });

  // FUT-670: `ChatMessage` used to be a hand-rolled composite; the barrel now
  // re-exports Astryx's. A green `tsc --noEmit` does NOT prove this — TypeScript
  // silently DROPS a name exported ambiguously by two `export *` sources rather
  // than erroring, so a leftover composite export would typecheck while
  // shadowing (or being shadowed by) the primitive. Assert object identity so
  // the barrel is pinned to the real Astryx component, not merely to *a*
  // `ChatMessage`.
  it('resolves ChatMessage/Collapsible to the Astryx components themselves', () => {
    expect(Surface.ChatMessage).toBe(AstryxChatMessage);
    expect(Surface.Collapsible).toBe(AstryxCollapsible);
  });
});
