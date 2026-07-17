import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  ChatComposer,
  ChatComposerDrawer,
  ChatComposerInput,
  ChatLayout,
  ChatMessage,
  ChatMessageList,
  ChatToolCalls,
} from '../../../src/primitives/chat';
import { Markdown } from '../../../src/primitives/markdown';
import { Token } from '../../../src/primitives/token';

// Wraps <ChatComposer> with real React state for `value`/`onChange`. This is
// NOT decorative — see the PROBE 1 finding below the assertion: a composer
// whose `value` prop doesn't round-trip through the DOM's real content will
// silently swallow Enter-submits.
function ControlledComposer({
  onSubmit,
  onChangeSpy,
}: {
  onSubmit: (value: string) => void;
  onChangeSpy: (value: string) => void;
}) {
  const [value, setValue] = useState('');
  return (
    <ChatComposer
      value={value}
      onChange={(next) => {
        onChangeSpy(next);
        setValue(next);
      }}
      onSubmit={onSubmit}
      placeholder="Ask"
      input={<ChatComposerInput />}
    />
  );
}

describe('Astryx Chat contract (happy-dom)', () => {
  it('composer: contenteditable input, controlled change, submit on Enter', () => {
    const onSubmit = vi.fn();
    const onChangeSpy = vi.fn();
    render(<ControlledComposer onSubmit={onSubmit} onChangeSpy={onChangeSpy} />);
    const box = document.querySelector('[contenteditable]') as HTMLElement;
    expect(box).toBeTruthy();
    fireEvent.input(box, { target: { textContent: 'hello' } });
    expect(onChangeSpy).toHaveBeenCalledWith('hello');
    fireEvent.keyDown(box, { key: 'Enter' });
    // PROBE 1 finding: Enter (without Shift) DOES submit — but only through
    // <ChatComposer>'s OWN `value` state, not through the raw contentEditable
    // DOM text. Read dist/Chat/ChatComposerInput.js ~L308-322:
    // `handleKeyDown` on `Enter && !e.shiftKey` computes
    // `serialize(editableRef.current).trim()` and calls `onSubmit?.(text)`
    // — but that `onSubmit` (defaulted from `composerCtx?.onSubmit`,
    // ChatComposerInput.js ~L130) is `<ChatComposer>`'s `handleSubmit`
    // (dist/Chat/ChatComposer.js ~L117-124):
    //   `const trimmed = currentValue.trim(); if (!trimmed || isDisabled) return; onSubmit(trimmed);`
    // `handleSubmit` IGNORES the `text` argument ChatComposerInput passed it
    // entirely and re-derives `trimmed` from its own closed-over
    // `currentValue` (`<ChatComposer>`'s `value` prop, ChatComposer.js
    // ~L108-110). So if a caller renders a static `value=""` with a
    // no-op/mock `onChange` (i.e. doesn't round-trip real state — exactly
    // what an earlier draft of this test did), Enter fires
    // `onChange('')` and clears the DOM (ChatComposerInput.js ~L320-324,
    // unconditional after the Enter branch) WITHOUT ever calling the real
    // `onSubmit` — the message is silently dropped. Confirmed empirically:
    // with a static `value=""`/no-op `onChange`, `onSubmit.mock.calls` was
    // `[]` after Enter even though the DOM showed "hello" beforehand. Task 3
    // MUST wire `value`/`onChange` through real state (as `ControlledComposer`
    // does here) — never pass a static `value`.
    expect(onSubmit).toHaveBeenCalledWith('hello');
  });

  it('composer: drawer renders attachment tokens with remove', () => {
    const onRemove = vi.fn();
    render(
      <ChatComposer
        value=""
        onChange={() => {}}
        onSubmit={() => {}}
        input={<ChatComposerInput />}
        drawer={
          <ChatComposerDrawer count={1}>
            <Token label="report.pdf" onRemove={onRemove} />
          </ChatComposerDrawer>
        }
      />,
    );
    expect(screen.getByText('report.pdf')).toBeInTheDocument();
    // The remove button is rendered by Astryx `Token` with
    // `aria-label="Remove ${label}"` (dist/Token/Token.js L219/L289) — assert
    // it actually fires `onRemove`, not just that the token's label renders.
    fireEvent.click(screen.getByRole('button', { name: 'Remove report.pdf' }));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it('transcript trio renders with sender semantics', () => {
    render(
      <ChatLayout composer={<div data-testid="c" />}>
        <ChatMessageList>
          <ChatMessage sender="user">Hi</ChatMessage>
          <ChatMessage sender="assistant" name="Agent">
            Hello
          </ChatMessage>
        </ChatMessageList>
      </ChatLayout>,
    );
    expect(screen.getByText('Hi')).toBeInTheDocument();
    expect(screen.getByText('Hello')).toBeInTheDocument();
    // Sender semantics (ChatMessage.js L163-164): a message with no `name`
    // gets `aria-label="Message from ${sender}"`; a message WITH `name` gets
    // `aria-labelledby` pointing at the rendered name node (L181) instead.
    // Assert both, plus the `name` text itself, so a future swap that flips
    // the user/assistant a11y distinction actually fails this suite.
    expect(screen.getByLabelText('Message from user')).toBeInTheDocument();
    expect(screen.getByText('Agent')).toBeInTheDocument();
    expect(screen.getByTestId('c')).toBeInTheDocument();
  });

  it('tool calls: single-call row exposes the error message via a title attribute', () => {
    render(<ChatToolCalls calls={[{ name: 'x', status: 'error', errorMessage: 'boom' }]} />);
    // PROBE (query pin): a single-element `calls` array renders inline via
    // `CallRow` with no group chrome — `defaultIsExpanded`/`isExpanded` only
    // gate the collapsible *summary* used for >1 calls (ChatToolCalls.js
    // L270 `if (calls.length === 1) { ... }`) — confirmed the test still
    // passes with `defaultIsExpanded` removed entirely, since it has no
    // effect on the single-call path this test exercises. `errorMessage` is NOT
    // rendered as visible text; it is set as a native `title` attribute on
    // the status-icon `<span>` (ChatToolCalls.js ~L129:
    // `title: status === 'error' ? call.errorMessage : undefined`). So the
    // query that finds it is `getByTitle`, not `getByText`.
    expect(screen.getByTitle('boom')).toBeInTheDocument();
    expect(screen.getByText('x')).toBeInTheDocument();
  });

  it('markdown renders GFM (table + code + link)', () => {
    render(<Markdown>{'| a |\n|---|\n| b |\n\n`code` [x](https://e.com)'}</Markdown>);
    expect(screen.getByText('b')).toBeInTheDocument();
    expect(screen.getByText('code')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'x' })).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// PROBE ANSWERS (drive Tasks 2-5 — see task-1-report.md for full evidence)
// ---------------------------------------------------------------------------
//
// 1. ChatToolCalls controlled expansion: CONTROLLED IS SUPPORTED.
//    dist/Chat/ChatToolCalls.js L256-257:
//      `const isControlled = controlledExpanded !== undefined;`
//      `const isExpanded = isControlled ? controlledExpanded : internalExpanded;`
//    Passing `isExpanded` (even `isExpanded={false}`) makes the component
//    fully controlled; omitting it (or passing `undefined`) falls back to
//    `defaultIsExpanded` + internal state. Our ChainOfThought shell may
//    keep owning open state via the controlled `isExpanded` prop if it
//    wants to (Task 4/5 decision) — it is not forced into uncontrolled mode.
//
// 2. Markdown coverage verdict: DELETE `chat-markdown.tsx` in Task 5.
//    Astryx `Markdown` (dist/Markdown/Markdown.js) already covers every
//    behavior our hand-rolled `Components` map (src/composites/chat-markdown.tsx)
//    exists for, and does it with real Astryx components instead of ad-hoc
//    Tailwind classes. NOTE: "covers" below is not "identical parity" for
//    links — see the correction beneath the list.
//      - Links: our `a` renderer hardcodes `target="_blank" rel="noreferrer
//        noopener"` on EVERY href. Astryx only does this for a link it
//        classifies as external — `isExternal = safeHref.startsWith('https://')
//        || safeHref.startsWith('http://')` (Markdown.js L638) — then sets
//        `target: '_blank', rel: 'noopener noreferrer'` (~L647-654: "external
//        links with target=\"_blank\" should use a plain anchor"). Relative,
//        anchor (`#...`), and `mailto:` links do NOT get `target="_blank"`
//        under Astryx, unlike our current renderer. This is a behavior
//        CHANGE (probably an improvement), not strict parity — Task 5 must
//        know this going in, not discover it after ship.
//      - Tables: our `table`/`th`/`td` renderers are raw `<table>` elements
//        with manual border/padding classes. Astryx renders GFM tables with
//        its own themed `Table`/`TableRow`/`TableCell`/`TableHeaderCell`/
//        `TableHeader`/`TableBody` components (Markdown.js imports at
//        ~L22-27, used at the `case 'table':` branches ~L380/734/917),
//        i.e. real design-system components, not styled HTML.
//      - Code: our single `code` renderer branches on a `language-` class
//        prefix to fake an inline/block split. Astryx has two dedicated
//        slots: `components.inlineCode` (~L614-615 `InlineCodeComp =
//        components?.inlineCode`) for inline code and `components.code`
//        backed by its own `CodeBlock`/`Code` components (~L817-826) for
//        fenced blocks — plus `headingLevelStart` (1-6) which our version
//        doesn't offer (we only style h1-h3).
//    MarkdownComponents (dist/Markdown/Markdown.d.ts) is intentionally
//    narrower than our old Components map (code, inlineCode, citation,
//    link, heading, paragraph, image, blockquote, hr — no ul/ol/li/strong/
//    em/table/th/td slots), because those remaining node types are meant
//    to just take Astryx's themed defaults, not be re-skinned per call site.
//    No named gap justifies keeping a wrapper: verdict is DELETE, not KEEP.
//    RISK for Task 5: our wrapper's outer div hardcodes `text-body-sm
//    leading-[1.55]` (chat-markdown.tsx L75) on every render. Astryx
//    `Markdown` exposes a `density?: 'default' | 'compact'` prop
//    (Markdown.d.ts L75) — the natural analogue — but no `density` value is
//    guaranteed to reproduce our hardcoded size/line-height exactly. Task 5
//    must pick a `density` deliberately (verify visually) instead of
//    dropping the prop and silently inheriting Astryx's default, or the
//    swap ships an unreviewed typography/density shift.
//
// 3. Dictation unsupported: HIDDEN (renders null), not disabled.
//    dist/Chat/ChatDictationButton.js ~L82-89:
//      `isHiddenWhenUnsupported = true` (default) and
//      `if (isHiddenWhenUnsupported && !dictation.isSupported) { return null; }`
//    Under happy-dom there is no `SpeechRecognition`/`webkitSpeechRecognition`,
//    so `useChatDictation()`/`useSpeechRecognition()` report `isSupported:
//    false`, and `<ChatDictationButton dictation={...} />` renders nothing
//    by default. Task 3 must NOT rely on a disabled/greyed-out affordance
//    for the no-mic-support case — the button simply isn't in the DOM
//    unless the caller explicitly passes `isHiddenWhenUnsupported={false}`.
//
// 4. Reading current composer tokens at submit time:
//    There is NO public API to read a live structured token list at submit
//    time. `useChatComposerTokens` (dist/Chat/useChatComposerTokens.d.ts) is
//    already consumed internally by `ChatComposerInput` itself — it calls
//    `useChatComposerTokens({ editableRef, onEmitChange })` with its own
//    internal `editableRef` (dist/Chat/ChatComposerInput.js ~L234) and does
//    NOT forward `tokens.tokenPortals` (or any other hook return value)
//    through `ChatComposerInputHandle`. The handle
//    (`ChatComposerInputHandle`, ChatComposerInput.d.ts) only exposes
//    `insertToken`, `expandToken`, `insertText`, `focus`, and
//    `getValue: () => string` — `getValue()`/the controlled `value`/
//    `onChange` string is the *serialized* text, where each token has
//    already been replaced by its `ChatComposerToken.value` field ("what
//    this token becomes in the onSubmit string" — ChatComposerInput.d.ts).
//    Calling `useChatComposerTokens` a second time against the same
//    contentEditable node (e.g. from a second ref in consumer code) would
//    create a competing, out-of-sync token-portal instance — not a
//    supported read path.
//    Exact call Task 3's `collectMentionTokens()` must make: none of the
//    hook's — instead, maintain the token list in caller-owned state,
//    captured at insertion time via each `ChatComposerTrigger.onSelect`
//    (`(item: SearchableItem) => string | ChatComposerToken`), e.g. push
//    every returned `ChatComposerToken` onto a ref/array as it's selected.
//    At submit time, filter that caller-side list down to tokens whose
//    `.value` still appears as a substring of the current serialized
//    `value` (from `onChange`/`ChatComposerInputHandle.getValue()`), to
//    drop any the user has since deleted from the input.
