import type { Editor } from '@tiptap/react';
import {
  Bold,
  Code,
  Code2,
  Heading1,
  Heading2,
  Italic,
  Link,
  List,
  ListOrdered,
  Strikethrough,
  Type,
  Underline,
} from 'lucide-react';
import { Button } from '../primitives/button';

interface Props {
  editor: Editor | null;
}

type HeadingLevel = 1 | 2;

export function RichTextToolbar({ editor }: Props) {
  if (!editor) return null;

  const headingLabel = editor.isActive('heading', { level: 1 })
    ? 'H1'
    : editor.isActive('heading', { level: 2 })
      ? 'H2'
      : 'Normal';

  const setHeading = (level: HeadingLevel | null) => {
    if (level === null) {
      // biome-ignore lint/suspicious/noExplicitAny: Tiptap extension commands
      (editor.chain().focus() as any).setParagraph().run();
    } else {
      // biome-ignore lint/suspicious/noExplicitAny: Tiptap extension commands
      (editor.chain().focus() as any).toggleHeading({ level }).run();
    }
  };

  const toggleLink = () => {
    if (editor.isActive('link')) {
      // biome-ignore lint/suspicious/noExplicitAny: Tiptap extension commands
      (editor.chain().focus() as any).unsetLink().run();
      return;
    }
    const url = window.prompt('Enter URL');
    if (!url) return;
    // biome-ignore lint/suspicious/noExplicitAny: Tiptap extension commands
    (editor.chain().focus() as any).setLink({ href: url }).run();
  };

  return (
    <div className="flex flex-wrap gap-0.5 border-b border-hairline bg-surface-1 px-1.5 py-1">
      {/* Heading dropdown — cycle Normal → H1 → H2 → Normal */}
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="w-16 text-xs"
        onClick={() => {
          if (headingLabel === 'Normal') setHeading(1);
          else if (headingLabel === 'H1') setHeading(2);
          else setHeading(null);
        }}
      >
        {headingLabel === 'Normal' ? (
          <Type className="size-3.5" />
        ) : headingLabel === 'H1' ? (
          <Heading1 className="size-3.5" />
        ) : (
          <Heading2 className="size-3.5" />
        )}
        <span className="ml-1">{headingLabel}</span>
      </Button>

      <Button
        type="button"
        size="sm"
        variant={editor.isActive('bold') ? 'secondary' : 'ghost'}
        onClick={() => {
          // biome-ignore lint/suspicious/noExplicitAny: Tiptap extension commands
          (editor.chain().focus() as any).toggleBold().run();
        }}
        aria-label="Bold"
      >
        <Bold className="size-3.5" />
      </Button>

      <Button
        type="button"
        size="sm"
        variant={editor.isActive('italic') ? 'secondary' : 'ghost'}
        onClick={() => {
          // biome-ignore lint/suspicious/noExplicitAny: Tiptap extension commands
          (editor.chain().focus() as any).toggleItalic().run();
        }}
        aria-label="Italic"
      >
        <Italic className="size-3.5" />
      </Button>

      <Button
        type="button"
        size="sm"
        variant={editor.isActive('underline') ? 'secondary' : 'ghost'}
        onClick={() => {
          // biome-ignore lint/suspicious/noExplicitAny: Tiptap extension commands
          (editor.chain().focus() as any).toggleUnderline().run();
        }}
        aria-label="Underline"
      >
        <Underline className="size-3.5" />
      </Button>

      <Button
        type="button"
        size="sm"
        variant={editor.isActive('strike') ? 'secondary' : 'ghost'}
        onClick={() => {
          // biome-ignore lint/suspicious/noExplicitAny: Tiptap extension commands
          (editor.chain().focus() as any).toggleStrike().run();
        }}
        aria-label="Strikethrough"
      >
        <Strikethrough className="size-3.5" />
      </Button>

      <Button
        type="button"
        size="sm"
        variant={editor.isActive('bulletList') ? 'secondary' : 'ghost'}
        onClick={() => {
          // biome-ignore lint/suspicious/noExplicitAny: Tiptap extension commands
          (editor.chain().focus() as any).toggleBulletList().run();
        }}
        aria-label="Bullet list"
      >
        <List className="size-3.5" />
      </Button>

      <Button
        type="button"
        size="sm"
        variant={editor.isActive('orderedList') ? 'secondary' : 'ghost'}
        onClick={() => {
          // biome-ignore lint/suspicious/noExplicitAny: Tiptap extension commands
          (editor.chain().focus() as any).toggleOrderedList().run();
        }}
        aria-label="Ordered list"
      >
        <ListOrdered className="size-3.5" />
      </Button>

      <Button
        type="button"
        size="sm"
        variant={editor.isActive('code') ? 'secondary' : 'ghost'}
        onClick={() => {
          // biome-ignore lint/suspicious/noExplicitAny: Tiptap extension commands
          (editor.chain().focus() as any).toggleCode().run();
        }}
        aria-label="Inline code"
      >
        <Code className="size-3.5" />
      </Button>

      <Button
        type="button"
        size="sm"
        variant={editor.isActive('codeBlock') ? 'secondary' : 'ghost'}
        onClick={() => {
          // biome-ignore lint/suspicious/noExplicitAny: Tiptap extension commands
          (editor.chain().focus() as any).toggleCodeBlock().run();
        }}
        aria-label="Code block"
      >
        <Code2 className="size-3.5" />
      </Button>

      <Button
        type="button"
        size="sm"
        variant={editor.isActive('link') ? 'secondary' : 'ghost'}
        onClick={toggleLink}
        aria-label="Link"
      >
        <Link className="size-3.5" />
      </Button>
    </div>
  );
}
