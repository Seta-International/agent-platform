import { describe, expect, it } from 'vitest';
import * as Surface from '../src/index';

const REQUIRED = [
  'Alert',
  'Avatar',
  'Badge',
  'Button',
  'Calendar',
  'Card',
  'Checkbox',
  'CommandPalette',
  'DataTable',
  'Dialog',
  'DropdownMenu',
  'EmptyState',
  'Form',
  'InboxList',
  'Input',
  'KbdHint',
  'Label',
  'Popover',
  'ScrollArea',
  'SetaLogo',
  'SetaMark',
  'Sheet',
  'SidePanel',
  'Skeleton',
  'Switch',
  'Table',
  'Tabs',
  'Textarea',
  'ThemeProvider',
  'ThemeToggle',
  'Toaster',
  'Tooltip',
  'cn',
  'cva',
  'useTheme',
];

describe('@seta/shared-ui public surface', () => {
  it('exports every documented name', () => {
    const keys = new Set(Object.keys(Surface));
    const missing = REQUIRED.filter((name) => !keys.has(name));
    expect(missing).toEqual([]);
  });
});
