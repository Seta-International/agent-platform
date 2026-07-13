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
        label={headingLabel}
        icon={
          headingLabel === 'Normal' ? (
            <Type className="size-3.5" />
          ) : headingLabel === 'H1' ? (
            <Heading1 className="size-3.5" />
          ) : (
            <Heading2 className="size-3.5" />
          )
        }
        onClick={() => {
          if (headingLabel === 'Normal') setHeading(1);
          else if (headingLabel === 'H1') setHeading(2);
          else setHeading(null);
        }}
      />

      <Button
        type="button"
        size="sm"
        variant={editor.isActive('bold') ? 'secondary' : 'ghost'}
        isIconOnly
        icon={<Bold className="size-3.5" />}
        label="Bold"
        onClick={() => {
          // biome-ignore lint/suspicious/noExplicitAny: Tiptap extension commands
          (editor.chain().focus() as any).toggleBold().run();
        }}
      />

      <Button
        type="button"
        size="sm"
        variant={editor.isActive('italic') ? 'secondary' : 'ghost'}
        isIconOnly
        icon={<Italic className="size-3.5" />}
        label="Italic"
        onClick={() => {
          // biome-ignore lint/suspicious/noExplicitAny: Tiptap extension commands
          (editor.chain().focus() as any).toggleItalic().run();
        }}
      />

      <Button
        type="button"
        size="sm"
        variant={editor.isActive('underline') ? 'secondary' : 'ghost'}
        isIconOnly
        icon={<Underline className="size-3.5" />}
        label="Underline"
        onClick={() => {
          // biome-ignore lint/suspicious/noExplicitAny: Tiptap extension commands
          (editor.chain().focus() as any).toggleUnderline().run();
        }}
      />

      <Button
        type="button"
        size="sm"
        variant={editor.isActive('strike') ? 'secondary' : 'ghost'}
        isIconOnly
        icon={<Strikethrough className="size-3.5" />}
        label="Strikethrough"
        onClick={() => {
          // biome-ignore lint/suspicious/noExplicitAny: Tiptap extension commands
          (editor.chain().focus() as any).toggleStrike().run();
        }}
      />

      <Button
        type="button"
        size="sm"
        variant={editor.isActive('bulletList') ? 'secondary' : 'ghost'}
        isIconOnly
        icon={<List className="size-3.5" />}
        label="Bullet list"
        onClick={() => {
          // biome-ignore lint/suspicious/noExplicitAny: Tiptap extension commands
          (editor.chain().focus() as any).toggleBulletList().run();
        }}
      />

      <Button
        type="button"
        size="sm"
        variant={editor.isActive('orderedList') ? 'secondary' : 'ghost'}
        isIconOnly
        icon={<ListOrdered className="size-3.5" />}
        label="Ordered list"
        onClick={() => {
          // biome-ignore lint/suspicious/noExplicitAny: Tiptap extension commands
          (editor.chain().focus() as any).toggleOrderedList().run();
        }}
      />

      <Button
        type="button"
        size="sm"
        variant={editor.isActive('code') ? 'secondary' : 'ghost'}
        isIconOnly
        icon={<Code className="size-3.5" />}
        label="Inline code"
        onClick={() => {
          // biome-ignore lint/suspicious/noExplicitAny: Tiptap extension commands
          (editor.chain().focus() as any).toggleCode().run();
        }}
      />

      <Button
        type="button"
        size="sm"
        variant={editor.isActive('codeBlock') ? 'secondary' : 'ghost'}
        isIconOnly
        icon={<Code2 className="size-3.5" />}
        label="Code block"
        onClick={() => {
          // biome-ignore lint/suspicious/noExplicitAny: Tiptap extension commands
          (editor.chain().focus() as any).toggleCodeBlock().run();
        }}
      />

      <Button
        type="button"
        size="sm"
        variant={editor.isActive('link') ? 'secondary' : 'ghost'}
        isIconOnly
        icon={<Link className="size-3.5" />}
        label="Link"
        onClick={toggleLink}
      />
    </div>
  );
}
