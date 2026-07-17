import type { Editor } from '@tiptap/react';
import {
  Bold,
  Code,
  Code2,
  Italic,
  Link,
  List,
  ListOrdered,
  Strikethrough,
  Underline,
} from 'lucide-react';
import { Button } from '../primitives/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../primitives/select';

interface Props {
  editor: Editor | null;
}

export function RichTextToolbar({ editor }: Props) {
  if (!editor) return null;

  const textStyle = editor.isActive('heading', { level: 1 })
    ? 'h1'
    : editor.isActive('heading', { level: 2 })
      ? 'h2'
      : 'p';

  const setTextStyle = (style: string) => {
    if (style === 'p') {
      // biome-ignore lint/suspicious/noExplicitAny: Tiptap extension commands
      (editor.chain().focus() as any).setParagraph().run();
    } else {
      // biome-ignore lint/suspicious/noExplicitAny: Tiptap extension commands
      (editor.chain().focus() as any).setHeading({ level: style === 'h1' ? 1 : 2 }).run();
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
      {/* Explicit text-style picker — a cycling button reads as a status, not a control,
          and clicking "H1" that produces H2 breaks trust in the whole toolbar. */}
      <Select value={textStyle} onValueChange={setTextStyle}>
        <SelectTrigger
          aria-label="Text style"
          className="h-7 w-28 border-none bg-transparent text-xs shadow-none"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="p">Normal</SelectItem>
          <SelectItem value="h1">Heading 1</SelectItem>
          <SelectItem value="h2">Heading 2</SelectItem>
        </SelectContent>
      </Select>

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
