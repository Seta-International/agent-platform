import { describe, expect, it } from 'vitest';
import { attachmentsBlockSend } from '../../../src/hooks/use-chat-attachments';

// Moved from shared-ui's deleted `chat-composer` composite (FUT-670): the gate
// is agent-chat domain logic, not design-system chrome.
describe('attachmentsBlockSend', () => {
  it('blocks while any attachment is still uploading', () => {
    expect(attachmentsBlockSend([{ id: '1', filename: 'a', status: 'uploading' }])).toBe(true);
  });

  it('does not block on uploaded or failed attachments', () => {
    expect(attachmentsBlockSend([{ id: '1', filename: 'a', status: 'uploaded' }])).toBe(false);
    expect(attachmentsBlockSend([{ id: '1', filename: 'a', status: 'failed' }])).toBe(false);
    expect(attachmentsBlockSend([])).toBe(false);
  });

  it('blocks when an in-flight upload sits alongside a finished one', () => {
    expect(
      attachmentsBlockSend([
        { id: '1', filename: 'a', status: 'uploaded' },
        { id: '2', filename: 'b', status: 'uploading' },
      ]),
    ).toBe(true);
  });
});
