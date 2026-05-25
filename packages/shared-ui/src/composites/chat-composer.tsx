import { Send } from 'lucide-react';
import { type KeyboardEvent, type ReactNode, useLayoutEffect, useRef } from 'react';
import { cn } from '../lib/cn';

const MAX_TEXTAREA_HEIGHT_PX = 160;

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
}: ChatComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: textarea must re-measure when value changes
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    Object.assign(el.style, {
      height: `${Math.min(el.scrollHeight, MAX_TEXTAREA_HEIGHT_PX)}px`,
    });
  }, [value]);

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!disabled && !pending && value.trim()) onSubmit();
    }
  };
  return (
    <div className={cn('border-t border-hairline bg-canvas px-3 py-3 md:px-4 md:py-4', className)}>
      <div className="mx-auto max-w-conversation">
        <div className="rounded-xl border border-hairline bg-canvas px-3 pt-2.5 pb-2 shadow-sm transition-[border-color,background-color,box-shadow] duration-150 focus-within:border-primary-border focus-within:bg-surface-1 focus-within:shadow-[0_0_0_3px_var(--color-primary-tint)]">
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
              {toolbar}
              {permissionHint && <span className="text-ink-subtle">{permissionHint}</span>}
            </div>
            <button
              type="button"
              onClick={() => !disabled && !pending && value.trim() && onSubmit()}
              disabled={disabled || pending || !value.trim()}
              aria-label="Send"
              title="Send  ⏎"
              className="inline-flex size-7 flex-none items-center justify-center rounded-md bg-primary text-on-primary transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Send className="size-3.5" aria-hidden />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
