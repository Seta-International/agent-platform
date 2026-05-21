import { Send } from 'lucide-react';
import { type KeyboardEvent, type ReactNode, useLayoutEffect, useRef } from 'react';
import { cn } from '../lib/cn';
import { KbdHint } from './kbd-hint';

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
    // height must be reset to 'auto' first so scrollHeight reflects actual content
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
    <div className={cn('border-t border-hairline bg-canvas px-4 py-4 md:px-6 md:py-5', className)}>
      <div className="mx-auto max-w-conversation">
        <div className="rounded-xl border border-hairline bg-canvas p-3 shadow-sm transition-[background-color,border-color] duration-150 focus-within:border-hairline-strong focus-within:bg-surface-1">
          <textarea
            ref={textareaRef}
            className="block w-full resize-none overflow-y-auto bg-transparent text-body-sm leading-[1.4] placeholder:text-ink-subtle focus:outline-none focus-visible:outline-none"
            rows={1}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={placeholder ?? 'Message your assistant…'}
            disabled={disabled || pending}
          />
          <div className="mt-2.5 flex items-center justify-between gap-3">
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-caption">
              {toolbar}
              {permissionHint && <span className="text-ink-subtle">{permissionHint}</span>}
            </div>
            <div className="flex shrink-0 items-center gap-2 text-caption text-ink-subtle">
              <span className="hidden items-center gap-1 sm:inline-flex">
                <KbdHint keys={['⏎']} /> send
              </span>
              <span aria-hidden className="hidden sm:inline">
                ·
              </span>
              <span className="hidden items-center gap-1 sm:inline-flex">
                <KbdHint keys={['⇧⏎']} /> new line
              </span>
              <button
                type="button"
                onClick={() => !disabled && !pending && value.trim() && onSubmit()}
                disabled={disabled || pending || !value.trim()}
                aria-label="Send"
                className="ml-1 inline-flex size-7 items-center justify-center rounded-md bg-primary text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Send className="size-3.5" aria-hidden />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
