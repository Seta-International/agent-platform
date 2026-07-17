import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const setText = vi.fn();
const send = vi.fn();
const cancelRun = vi.fn();
let isRunning = false;

vi.mock('@assistant-ui/react', () => ({
  useAui: () => ({
    composer: () => ({ setText, send }),
    thread: () => ({ cancelRun }),
  }),
  // The composer reads only `thread.isRunning`.
  useAuiState: (sel: (s: { thread: { isRunning: boolean } }) => unknown) =>
    sel({ thread: { isRunning } }),
}));

// Static source: the real one fetches /api/people/v1/workers.
vi.mock('../../../src/api/people-search', () => ({
  peopleSearch: {
    source: {
      search: async () => [{ id: 'w1', label: 'Jane Doe' }],
      bootstrap: async () => [{ id: 'w1', label: 'Jane Doe' }],
      cancel: () => {},
    },
    seed: async () => [],
  },
}));

// Avoid the model-catalog fetch; the selector is not under test here.
vi.mock('../../../src/components/model-selector', () => ({
  ModelSelector: () => <div data-testid="model-selector" />,
}));

const attach = vi.fn();
const remove = vi.fn();
const reset = vi.fn();
let attachments: Array<{
  id: string;
  filename: string;
  status: 'uploading' | 'uploaded' | 'failed';
  progress?: number;
}> = [];
let warning: string | null = null;

vi.mock('../../../src/hooks/use-chat-attachments', async () => {
  const actual = await vi.importActual<typeof import('../../../src/hooks/use-chat-attachments')>(
    '../../../src/hooks/use-chat-attachments',
  );
  return {
    // Keep the REAL attachmentsBlockSend — the send gate is an engine invariant.
    ...actual,
    useChatAttachments: () => ({ attachments, attach, remove, reset, warning }),
  };
});

let runError: string | null = null;
const clearRunError = vi.fn();
const mentionsRef: { current: Array<{ kind: string; id: string; label: string }> } = {
  current: [],
};
let pageContext: { kind: string; id: string; label: string } | null = null;
let suppressedFor: string | null = null;
const suppressFor = vi.fn();
let pendingPrompt: { text: string; autoSend: boolean } | null = null;
const setPendingPrompt = vi.fn();
const setModelKey = vi.fn();

vi.mock('../../../src/chat-experience/agent-provider', () => ({
  useAgentSelection: () => ({
    selection: { threadId: 't1', modelKey: 'auto', isThreadFresh: true },
    actions: { setModelKey, setThreadId: vi.fn(), startFreshThread: vi.fn() },
  }),
  usePanelUI: () => ({
    panelOpen: true,
    setPanelOpen: vi.fn(),
    pendingPrompt,
    setPendingPrompt,
  }),
  useAgentRuntimeContext: () => ({
    runtime: {},
    historyLoading: false,
    runError,
    clearRunError,
    mentionsRef,
  }),
  usePageContext: () => ({
    pageContext,
    setPageContext: vi.fn(),
    suppressedFor,
    suppressFor,
    clearSuppression: vi.fn(),
  }),
}));

import { AgentComposer } from '../../../src/chat-experience/agent-composer';

/** The composer input is a contenteditable, never an <input>/<textarea>. */
function input(): HTMLElement {
  const box = document.querySelector('[contenteditable]');
  if (!box) throw new Error('composer contenteditable not found');
  return box as HTMLElement;
}

/**
 * Type into the contenteditable the way Astryx reads it back (serialize(DOM)),
 * leaving a collapsed caret at the end. The caret is load-bearing: the trigger
 * menu's `getTextBeforeCursor` returns null unless a collapsed Selection sits on
 * a text node inside the editable, so '@' would never open the menu without it.
 */
function type(text: string) {
  const box = input();
  box.textContent = text;
  const node = box.firstChild;
  if (node) {
    const range = document.createRange();
    range.setStart(node, (node.textContent ?? '').length);
    range.collapse(true);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  }
  fireEvent.input(box);
}

beforeEach(() => {
  vi.clearAllMocks();
  isRunning = false;
  attachments = [];
  warning = null;
  runError = null;
  mentionsRef.current = [];
  pageContext = null;
  suppressedFor = null;
  pendingPrompt = null;
});

describe('<AgentComposer> send path', () => {
  it('round-trips the controlled value and sends on Enter', () => {
    render(<AgentComposer />);
    type('hello');
    fireEvent.keyDown(input(), { key: 'Enter' });

    // Astryx's ChatComposer.handleSubmit re-derives the message from its own
    // `value` prop and IGNORES the text ChatComposerInput passes it. If
    // value/onChange didn't round-trip through real state this would silently
    // no-op, so asserting setText proves the controlled path is genuinely wired.
    expect(setText).toHaveBeenCalledWith('hello');
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('clears the prior run error on the next send', () => {
    runError = 'context overflow';
    render(<AgentComposer />);
    type('retry');
    fireEvent.keyDown(input(), { key: 'Enter' });
    expect(clearRunError).toHaveBeenCalledTimes(1);
  });

  it('does not send an empty or whitespace-only draft', () => {
    render(<AgentComposer />);
    type('   ');
    fireEvent.keyDown(input(), { key: 'Enter' });
    expect(send).not.toHaveBeenCalled();
  });

  it('blocks send while an attachment is still uploading', () => {
    attachments = [{ id: 'a1', filename: 'report.pdf', status: 'uploading', progress: 0.4 }];
    render(<AgentComposer />);
    type('here you go');
    fireEvent.keyDown(input(), { key: 'Enter' });
    expect(send).not.toHaveBeenCalled();
  });

  it('allows send once uploads finish', () => {
    attachments = [{ id: 'a1', filename: 'report.pdf', status: 'uploaded', progress: 1 }];
    render(<AgentComposer />);
    type('here you go');
    fireEvent.keyDown(input(), { key: 'Enter' });
    expect(send).toHaveBeenCalledTimes(1);
    // Chips are cleared for the next message; files persist server-side.
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it('does not send while a run is in flight', () => {
    isRunning = true;
    render(<AgentComposer />);
    type('hello');
    fireEvent.keyDown(input(), { key: 'Enter' });
    expect(send).not.toHaveBeenCalled();
  });

  it('does not send on the Enter that commits an IME composition (keyCode 229)', () => {
    // Chrome/Blink fires keydown with key:'Enter', keyCode:229 while a
    // Vietnamese/CJK composition is still live. Astryx's own Enter handler
    // has no isComposing/229 guard, so web-agent's wrapper must intercept it
    // in capture phase before Astryx's bubble handler ever runs.
    render(<AgentComposer />);
    type('chào');
    fireEvent.keyDown(input(), { key: 'Enter', keyCode: 229 });
    expect(send).not.toHaveBeenCalled();
  });

  it('does not send on Enter while nativeEvent.isComposing is true', () => {
    render(<AgentComposer />);
    type('chào');
    fireEvent.keyDown(input(), { key: 'Enter', isComposing: true });
    expect(send).not.toHaveBeenCalled();
  });
});

describe('<AgentComposer> stop', () => {
  it('cancels the run via the assistant-ui thread API', () => {
    isRunning = true;
    render(<AgentComposer />);
    fireEvent.click(screen.getByRole('button', { name: /stop/i }));
    expect(cancelRun).toHaveBeenCalledTimes(1);
  });

  it('shows no stop affordance when idle', () => {
    render(<AgentComposer />);
    expect(screen.queryByRole('button', { name: /stop/i })).toBeNull();
  });
});

describe('<AgentComposer> attachments', () => {
  it('attaches files pasted into the input (Astryx onFiles)', () => {
    render(<AgentComposer />);
    const file = new File(['x'], 'pasted.pdf', { type: 'application/pdf' });
    fireEvent.paste(input(), {
      clipboardData: { files: [file], types: ['Files'], getData: () => '' },
    });
    expect(attach).toHaveBeenCalledTimes(1);
    expect(attach.mock.calls[0]?.[0]?.[0]?.name).toBe('pasted.pdf');
  });

  it('attaches files dropped on the composer', () => {
    // ChatComposerInput registers NO drop listener (its `onFiles` fires only
    // from handlePaste), so drag-to-attach is web-agent's wrapper. Dropping on
    // the contenteditable must still reach it by bubbling.
    render(<AgentComposer />);
    const file = new File(['x'], 'dropped.pdf', { type: 'application/pdf' });
    fireEvent.drop(input(), { dataTransfer: { files: [file], types: ['Files'] } });
    expect(attach).toHaveBeenCalledTimes(1);
    expect(attach.mock.calls[0]?.[0]?.[0]?.name).toBe('dropped.pdf');
  });

  it('attaches files picked through the attach button', () => {
    render(<AgentComposer />);
    const picker = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(picker.accept).toBe('.pdf,.docx,.xlsx,.csv,.txt,.md');
    const file = new File(['x'], 'picked.csv', { type: 'text/csv' });
    fireEvent.change(picker, { target: { files: [file] } });
    expect(attach).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: /attach file/i })).toBeInTheDocument();
  });

  it('renders a removable chip per attachment with a VISIBLE status', () => {
    attachments = [{ id: 'a1', filename: 'report.pdf', status: 'uploading', progress: 0.42 }];
    render(<AgentComposer />);
    expect(screen.getByText('report.pdf')).toBeInTheDocument();
    // Token maps `description` to aria-description only, so the upload progress
    // the old composite showed must be real text in the DOM, not just a11y.
    expect(screen.getByText('42%')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Remove report.pdf' }));
    expect(remove).toHaveBeenCalledWith('a1');
  });

  it('surfaces a failed upload', () => {
    attachments = [{ id: 'a1', filename: 'bad.pdf', status: 'failed' }];
    render(<AgentComposer />);
    expect(screen.getByText('Failed')).toBeInTheDocument();
  });

  it('renders no drawer when there are no attachments', () => {
    render(<AgentComposer />);
    expect(screen.queryByText('report.pdf')).toBeNull();
  });
});

describe('<AgentComposer> page context', () => {
  it('renders the context token and detaches on remove', () => {
    pageContext = { kind: 'planner.task', id: 't1', label: 'Q3 launch' };
    render(<AgentComposer />);
    expect(screen.getByText('Q3 launch')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Remove Q3 launch' }));
    expect(suppressFor).toHaveBeenCalledWith('t1');
  });

  it('hides the context token once suppressed for that context', () => {
    pageContext = { kind: 'planner.task', id: 't1', label: 'Q3 launch' };
    suppressedFor = 't1';
    render(<AgentComposer />);
    expect(screen.queryByText('Q3 launch')).toBeNull();
  });

  it('renders nothing when there is no page context', () => {
    render(<AgentComposer />);
    expect(screen.queryByText('Q3 launch')).toBeNull();
  });
});

describe('<AgentComposer> status', () => {
  it('shows the run error through composer status', () => {
    runError = 'Context window exceeded';
    render(<AgentComposer />);
    expect(screen.getByText('Context window exceeded')).toBeInTheDocument();
  });

  it('shows the attachment warning when there is no run error', () => {
    warning = 'file is large';
    render(<AgentComposer />);
    expect(screen.getByText('file is large')).toBeInTheDocument();
  });

  it('prefers the run error over the warning', () => {
    runError = 'boom';
    warning = 'file is large';
    render(<AgentComposer />);
    expect(screen.getByText('boom')).toBeInTheDocument();
    expect(screen.queryByText('file is large')).toBeNull();
  });
});

describe('<AgentComposer> pendingPrompt', () => {
  it('auto-sends without touching the draft', () => {
    pendingPrompt = { text: 'Suggest an assignee', autoSend: true };
    render(<AgentComposer />);
    expect(setText).toHaveBeenCalledWith('Suggest an assignee');
    expect(send).toHaveBeenCalledTimes(1);
    expect(setPendingPrompt).toHaveBeenCalledWith(null);
  });

  it('seeds the contenteditable without sending when autoSend is false', async () => {
    pendingPrompt = { text: 'Draft this', autoSend: false };
    render(<AgentComposer />);
    // Proves the controlled value actually reaches the contenteditable DOM.
    await waitFor(() => expect(input().textContent).toBe('Draft this'));
    expect(send).not.toHaveBeenCalled();
  });
});

describe('<AgentComposer> mentions', () => {
  it('publishes the resolved mention to the runtime ref on send', async () => {
    render(<AgentComposer />);
    // Drive the real Astryx trigger menu: '@' opens it, the mocked source
    // resolves Jane, and picking her inserts a token. The menu selects on
    // mouseDown (not click) so the caret survives the pick.
    type('@Jane');
    const option = await screen.findByText('Jane Doe');
    fireEvent.mouseDown(option);

    await waitFor(() => expect(input().textContent).toContain('Jane Doe'));
    fireEvent.keyDown(input(), { key: 'Enter' });

    expect(mentionsRef.current).toEqual([{ kind: 'person', id: 'w1', label: 'Jane Doe' }]);
    expect(send).toHaveBeenCalledTimes(1);
    // The model only ever sees text, so the token must serialize to the
    // person's name — never a bare id.
    expect(setText).toHaveBeenCalledWith(expect.stringContaining('@Jane Doe'));
  });

  it('drops a mention whose token the user deleted before sending', async () => {
    render(<AgentComposer />);
    type('@Jane');
    fireEvent.mouseDown(await screen.findByText('Jane Doe'));
    await waitFor(() => expect(input().textContent).toContain('Jane Doe'));

    // Wipe the draft (token included) and send something else.
    type('never mind');
    fireEvent.keyDown(input(), { key: 'Enter' });

    expect(send).toHaveBeenCalledTimes(1);
    expect(mentionsRef.current).toEqual([]);
  });
});

describe('<AgentComposer> dictation', () => {
  it('hides the mic when SpeechRecognition is unsupported', () => {
    // ChatDictationButton defaults isHiddenWhenUnsupported=true and returns
    // null when unsupported — happy-dom has no SpeechRecognition, so the mic is
    // ABSENT, not disabled. Pinning the real environment behaviour.
    expect('SpeechRecognition' in window || 'webkitSpeechRecognition' in window).toBe(false);
    render(<AgentComposer />);
    expect(screen.queryByRole('button', { name: /dictat|voice|microphone|mic/i })).toBeNull();
  });

  it('renders the mic when SpeechRecognition is available', () => {
    class FakeRecognition {
      lang = '';
      continuous = false;
      interimResults = false;
      start() {}
      stop() {}
      abort() {}
      addEventListener() {}
      removeEventListener() {}
    }
    vi.stubGlobal('SpeechRecognition', FakeRecognition);
    try {
      render(<AgentComposer />);
      expect(
        screen.getByRole('button', { name: /dictat|voice|microphone|mic/i }),
      ).toBeInTheDocument();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
