import { describe, expect, it } from 'vitest';
import * as Surface from '../../src/index';

const REQUIRED = [
  'Avatar',
  'Badge',
  'Banner',
  'Button',
  'Calendar',
  'Card',
  'Checkbox',
  'DataTable',
  'DateInput',
  'Dialog',
  'DropdownMenu',
  'EmptyState',
  'InboxList',
  'Input',
  'KbdHint',
  'Label',
  'NumberInput',
  'Popover',
  'Selector',
  'SetaLogo',
  'SetaMark',
  'SidePanel',
  'Skeleton',
  'Switch',
  'Tab',
  'TabList',
  'Table',
  'Textarea',
  'ThemeProvider',
  'ThemeToggle',
  'TimeInput',
  'Toaster',
  'Tokenizer',
  'Tooltip',
  'Typeahead',
  'cn',
  'createStaticSource',
  'cva',
  'useSeededItem',
  'useSeededItems',
  'useTheme',
];

describe('@seta/shared-ui public surface', () => {
  it('exports every documented name', () => {
    const keys = new Set(Object.keys(Surface));
    const missing = REQUIRED.filter((name) => !keys.has(name));
    expect(missing).toEqual([]);
  });
});
