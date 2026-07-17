import { useAui, useAuiState } from '@assistant-ui/react';
import {
  ChatComposer,
  ChatComposerDrawer,
  ChatComposerInput,
  type ChatComposerInputHandle,
  type ChatComposerTrigger,
  ChatDictationButton,
  IconButton,
  Token,
  useChatDictation,
} from '@seta/shared-ui';
import { Paperclip } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { peopleSearch } from '../api/people-search';
import { ModelSelector } from '../components/model-selector';
import { attachmentsBlockSend, useChatAttachments } from '../hooks/use-chat-attachments';
import { AGENT_COPY } from '../i18n';
import { type PendingMention, reconcileMentions } from '../lib/mention-part';
import {
  useAgentRuntimeContext,
  useAgentSelection,
  usePageContext,
  usePanelUI,
} from './agent-provider';

const ATTACH_ACCEPT = '.pdf,.docx,.xlsx,.csv,.txt,.md';

/** Mirrors the deleted composite's chip copy. */
const STATUS_LABEL = {
  uploading: 'Uploading…',
  uploaded: 'Ready',
  failed: 'Failed',
} as const;

const CONTEXT_ICON: Record<string, string> = {
  'planner.task': '📋',
  'planner.group': '👥',
  'planner.plan': '🗂️',
};

function contextIcon(kind: string): string {
  return CONTEXT_ICON[kind] ?? '📎';
}

export function AgentComposer() {
  const [value, setValue] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const aui = useAui();
  const isRunning = useAuiState((s) => s.thread.isRunning);
  const { selection, actions } = useAgentSelection();
  const { pendingPrompt, setPendingPrompt } = usePanelUI();
  const { runError, clearRunError, mentionsRef } = useAgentRuntimeContext();
  const { pageContext, suppressedFor, suppressFor } = usePageContext();
  const { attachments, attach, remove, reset, warning } = useChatAttachments(selection.threadId);

  const inputRef = useRef<ChatComposerInputHandle>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dictation = useChatDictation({ inputRef });

  // Caller-owned mention log — see `reconcileMentions` for why Astryx leaves us
  // no way to read the live tokens back out at submit time.
  const pendingMentionsRef = useRef<PendingMention[]>([]);

  const triggers = useMemo<ChatComposerTrigger[]>(
    () => [
      {
        character: '@',
        searchSource: peopleSearch.source,
        menuLabel: 'People',
        onSelect: (item) => {
          // The orchestrator prompts on text only, so the token's serialized
          // form must be human-readable — an `@person:<uuid>` value would send
          // the model a bare id. The structured part carries the id instead.
          const token = { value: `@${item.label}`, label: item.label, variant: 'blue' as const };
          pendingMentionsRef.current.push({
            value: token.value,
            mention: { kind: 'person', id: item.id, label: item.label },
          });
          return token;
        },
      },
    ],
    [],
  );

  const submit = (text: string) => {
    if (!text.trim() || isRunning) return;
    if (attachmentsBlockSend(attachments)) return;
    // A fresh send clears any prior run error (e.g. a context-overflow 413).
    clearRunError();

    // Keep only mentions whose token survived to submit, deduped per entity.
    mentionsRef.current = reconcileMentions(pendingMentionsRef.current, text);
    pendingMentionsRef.current = [];

    // Page-context and mention parts are attached in useAgentRuntime's
    // toCreateMessage override (assistant-ui v0.14.5 rejects arbitrary parts on
    // composer.addAttachment).
    aui.composer().setText(text);
    aui.composer().send();
    setValue('');
    // Files persist server-side keyed by thread_id; the orchestrator finds them
    // on this and future turns. Clear the upload chips for the next message.
    reset();
  };

  // One-shot pending prompt from external callers (e.g. planner "Suggest
  // assignee" button).
  useEffect(() => {
    if (!pendingPrompt || isRunning) return;
    const { text, autoSend } = pendingPrompt;
    setPendingPrompt(null);
    if (autoSend) {
      aui.composer().setText(text);
      aui.composer().send();
      return;
    }
    // Non-autoSend seeds the draft: the controlled `value` renders into the
    // contenteditable, then focus so the user can keep typing.
    setValue(text);
    inputRef.current?.focus();
  }, [pendingPrompt, isRunning, aui, setPendingPrompt]);

  const showPageContext = Boolean(pageContext && suppressedFor !== pageContext.id);

  // Astryx's ChatComposerInput calls `onFiles` from its paste handler ONLY —
  // it registers no drop/dragover listener anywhere, despite its prop docs
  // saying "File drop/paste handler". So drag-to-attach is wired here, on
  // web-agent's own wrapper, rather than left silently broken.
  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    const files = Array.from(e.dataTransfer?.files ?? []);
    if (!files.length) return;
    e.preventDefault();
    setIsDragging(false);
    attach(files);
  };

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: drop target mirrors the paste path; the attach button is the keyboard-accessible equivalent
    <div
      // No chrome here — Astryx's dock already supplies the frosted-glass
      // surround and ChatComposer renders its own floating pill (border,
      // background, shadow). This div exists only to host the drag/IME
      // handlers below; it must stay visually transparent or it defeats the
      // dock's blur and double-pads the composer (FUT-670 review finding).
      onDragOver={(e) => {
        if (!e.dataTransfer?.types?.includes('Files')) return;
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
        setIsDragging(false);
      }}
      onDrop={onDrop}
      // Astryx's Enter handler has no IME guard and clears the draft
      // unconditionally; capture-phase is the only point before it runs.
      onKeyDownCapture={(e) => {
        if (e.nativeEvent.isComposing || e.keyCode === 229) e.stopPropagation();
        if (isRunning && e.key === 'Enter' && !e.shiftKey) e.stopPropagation();
      }}
    >
      <div
        // Drag highlight rides the pill's own radius (Astryx --radius-chat,
        // 28px) rather than a border on the transparent outer wrapper, so it
        // outlines the composer itself instead of a full-bleed strip.
        className={`mx-auto max-w-[45rem] ${
          isDragging ? 'rounded-[28px] ring-2 ring-primary/40' : ''
        }`}
      >
        <ChatComposer
          value={value}
          onChange={setValue}
          onSubmit={submit}
          placeholder={AGENT_COPY.composerPlaceholder}
          isStopShown={isRunning}
          onStop={() => aui.thread().cancelRun()}
          status={
            runError
              ? { type: 'error', message: runError }
              : warning
                ? { type: 'warning', message: warning }
                : undefined
          }
          input={
            <ChatComposerInput
              handleRef={inputRef}
              triggers={triggers}
              onFiles={(files) => attach(files)}
            />
          }
          headerActions={
            <>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                accept={ATTACH_ACCEPT}
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? []);
                  e.target.value = '';
                  if (files.length) attach(files);
                }}
              />
              <IconButton
                label="Attach file"
                icon={<Paperclip aria-hidden />}
                variant="ghost"
                size="sm"
                isDisabled={isRunning}
                onClick={() => fileInputRef.current?.click()}
              />
            </>
          }
          headerContext={
            showPageContext && pageContext ? (
              <Token
                label={pageContext.label}
                icon={<span aria-hidden>{contextIcon(pageContext.kind)}</span>}
                description={pageContext.kind}
                size="sm"
                onRemove={() => suppressFor(pageContext.id)}
              />
            ) : undefined
          }
          drawer={
            attachments.length > 0 ? (
              <ChatComposerDrawer count={attachments.length} label="Attachments">
                {attachments.map((a) => (
                  <Token
                    key={a.id}
                    label={a.filename}
                    size="sm"
                    color={a.status === 'failed' ? 'red' : 'default'}
                    description={STATUS_LABEL[a.status]}
                    // `description` is aria-only (Token.js maps it to
                    // aria-description), so the status the old composite showed
                    // has to ride in `endContent` to stay visible.
                    endContent={
                      <span style={{ color: 'var(--color-ink-subtle)' }}>
                        {a.status === 'uploading'
                          ? `${Math.round((a.progress ?? 0) * 100)}%`
                          : STATUS_LABEL[a.status]}
                      </span>
                    }
                    onRemove={() => remove(a.id)}
                  />
                ))}
              </ChatComposerDrawer>
            ) : undefined
          }
          footerActions={
            <ModelSelector
              value={selection.modelKey}
              onChange={actions.setModelKey}
              variant="ghost"
            />
          }
          sendActions={<ChatDictationButton dictation={dictation} size="sm" />}
        />
      </div>
    </div>
  );
}
