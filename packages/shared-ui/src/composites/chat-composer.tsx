import { Loader2, Paperclip, Send, X } from 'lucide-react';
import {
  type ChangeEvent,
  type KeyboardEvent,
  type ReactNode,
  useLayoutEffect,
  useRef,
} from 'react';
import { cn } from '../lib/cn';

const MAX_TEXTAREA_HEIGHT_PX = 160;

export interface ComposerAttachment {
  id: string;
  filename: string;
  status: 'uploading' | 'uploaded' | 'failed';
  progress?: number;
}

/** Send is blocked while any attachment is still uploading.
 *  Uploaded and failed attachments do not block (failed ones are removable). */
export function attachmentsBlockSend(attachments: readonly ComposerAttachment[]): boolean {
  return attachments.some((a) => a.status === 'uploading');
}

const STATUS_LABEL: Record<ComposerAttachment['status'], string> = {
  uploading: 'Uploading…',
  uploaded: 'Ready',
  failed: 'Failed',
};

export interface ChatComposerProps {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  placeholder?: string;
  pending?: boolean;
  disabled?: boolean;
  toolbar?: ReactNode;
  permissionHint?: string;
  className?: string;
  attachments?: ComposerAttachment[];
  onAttachFiles?: (files: File[]) => void;
  onRemoveAttachment?: (id: string) => void;
}

export function ChatComposer({
  value,
  onChange,
  onSubmit,
  placeholder,
  pending,
  disabled,
  toolbar,
  permissionHint,
  className,
  attachments,
  onAttachFiles,
  onRemoveAttachment,
}: ChatComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: textarea must re-measure when value changes
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    Object.assign(el.style, {
      height: `${Math.min(el.scrollHeight, MAX_TEXTAREA_HEIGHT_PX)}px`,
    });
  }, [value]);

  const blockSend = attachmentsBlockSend(attachments ?? []);
  const canSend = !disabled && !pending && !blockSend && value.trim().length > 0;

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (canSend) onSubmit();
    }
  };

  const onPickFiles = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (files.length && onAttachFiles) onAttachFiles(files);
  };

  return (
    <div className={cn('border-t border-hairline bg-canvas px-3 py-3 md:px-4 md:py-4', className)}>
      <div className="mx-auto max-w-conversation">
        <div className="rounded-xl border border-hairline bg-canvas px-3 pt-2.5 pb-2 shadow-sm transition-[border-color,background-color,box-shadow] duration-150 focus-within:border-primary-border focus-within:bg-surface-1 focus-within:shadow-[0_0_0_3px_var(--color-primary-tint)]">
          {attachments && attachments.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {attachments.map((a) => (
                <span
                  key={a.id}
                  title={STATUS_LABEL[a.status]}
                  className="inline-flex items-center gap-1.5 rounded-md border border-hairline bg-surface-1 px-2 py-1 text-caption"
                >
                  {a.status === 'uploading' ? (
                    <Loader2 className="size-3 animate-spin" aria-hidden />
                  ) : (
                    <Paperclip className="size-3" aria-hidden />
                  )}
                  <span className="max-w-[12rem] truncate">{a.filename}</span>
                  <span className="text-ink-subtle">
                    {a.status === 'uploading'
                      ? `${Math.round((a.progress ?? 0) * 100)}%`
                      : STATUS_LABEL[a.status]}
                  </span>
                  {onRemoveAttachment && (
                    <button
                      type="button"
                      onClick={() => onRemoveAttachment(a.id)}
                      aria-label={`Remove ${a.filename}`}
                      className="inline-flex size-3.5 items-center justify-center rounded text-ink-subtle opacity-70 transition-opacity hover:opacity-100"
                    >
                      <X className="size-3" aria-hidden />
                    </button>
                  )}
                </span>
              ))}
            </div>
          )}
          <textarea
            ref={textareaRef}
            className="block w-full resize-none overflow-y-auto bg-transparent text-body-sm leading-[1.45] placeholder:text-ink-subtle focus:outline-none focus-visible:outline-none"
            rows={1}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={placeholder ?? 'Message your assistant…'}
            disabled={disabled || pending}
          />
          <div className="mt-2 flex items-center justify-between gap-2">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1.5 gap-y-1 text-caption">
              {onAttachFiles && (
                <>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    className="hidden"
                    accept=".pdf,.docx,.xlsx,.csv,.txt,.md"
                    onChange={onPickFiles}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={disabled || pending}
                    aria-label="Attach file"
                    title="Attach file"
                    className="inline-flex size-7 flex-none items-center justify-center rounded-md text-ink-subtle transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Paperclip className="size-3.5" aria-hidden />
                  </button>
                </>
              )}
              {toolbar}
              {permissionHint && <span className="text-ink-subtle">{permissionHint}</span>}
            </div>
            <button
              type="button"
              onClick={() => canSend && onSubmit()}
              disabled={!canSend}
              aria-label={pending ? 'Loading' : 'Send'}
              title={pending ? undefined : 'Send  ⏎'}
              className="inline-flex size-7 flex-none items-center justify-center rounded-md bg-primary text-on-primary transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
            >
              {pending ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
              ) : (
                <Send className="size-3.5" aria-hidden />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
