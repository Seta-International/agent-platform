import { Link } from '@tiptap/extension-link';
import { Underline } from '@tiptap/extension-underline';
import { EditorContent, useEditor } from '@tiptap/react';
import { StarterKit } from '@tiptap/starter-kit';
import { useEffect } from 'react';
import { RichTextToolbar } from './RichTextToolbar';

interface Props {
  value: string;
  onChange: (html: string) => void;
  onSave?: () => void;
  onCancel?: () => void;
  className?: string;
  placeholder?: string;
}

function isHtmlEmpty(html: string | null | undefined): boolean {
  if (!html?.trim()) return true;
  if (html === '<p></p>') return true;
  if (typeof DOMParser !== 'undefined') {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return (doc.body.textContent ?? '').trim().length === 0;
  }
  return false;
}

export function RichTextEditor({ value, onChange, onSave, onCancel, className }: Props) {
  const editor = useEditor({
    extensions: [StarterKit, Underline, Link.configure({ openOnClick: false })],
    content: value,
    onUpdate({ editor: e }) {
      onChange(e.getHTML());
    },
    editorProps: {
      attributes: {
        class: 'rich-text min-h-[120px] p-2.5 focus:outline-none text-primary text-base',
      },
      handleKeyDown(_view, event) {
        if (event.key === 'Escape') {
          event.preventDefault();
          onCancel?.();
          return true;
        }
        if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          onSave?.();
          return true;
        }
        return false;
      },
    },
  });

  useEffect(() => {
    if (!editor) return;
    const currentHtml = editor.getHTML();
    if (value !== currentHtml) {
      const isValueEmpty = isHtmlEmpty(value);
      const isCurrentEmpty = editor.isEmpty || isHtmlEmpty(currentHtml);

      if (isValueEmpty && isCurrentEmpty) {
        if (currentHtml !== '<p></p>') {
          editor.commands.setContent(value || '');
        }
        return;
      }

      editor.commands.setContent(value || '');
    }
  }, [editor, value]);

  if (!editor) return null;

  return (
    <div className={`overflow-hidden rounded-md border border-border bg-card ${className ?? ''}`}>
      <RichTextToolbar editor={editor} />
      <EditorContent editor={editor} />
    </div>
  );
}
