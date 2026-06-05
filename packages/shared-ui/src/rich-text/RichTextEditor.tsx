import { Link } from '@tiptap/extension-link';
import { Underline } from '@tiptap/extension-underline';
import { EditorContent, useEditor } from '@tiptap/react';
import { StarterKit } from '@tiptap/starter-kit';
import { RichTextToolbar } from './RichTextToolbar';

interface Props {
  value: string;
  onChange: (html: string) => void;
  onSave?: () => void;
  onCancel?: () => void;
  className?: string;
  placeholder?: string;
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
        class: 'rich-text min-h-[120px] p-2.5 focus:outline-none text-ink text-body-sm',
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

  if (!editor) return null;

  return (
    <div
      className={`overflow-hidden rounded-md border border-hairline bg-surface-1 ${className ?? ''}`}
    >
      <RichTextToolbar editor={editor} />
      <EditorContent editor={editor} />
    </div>
  );
}
