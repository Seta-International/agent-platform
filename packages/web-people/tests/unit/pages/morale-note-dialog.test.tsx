import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { MoraleInboxNote } from '../../../src/api/people-client.ts';
import { MoraleNoteDialog } from '../../../src/pages/morale-note-dialog.tsx';

const note: MoraleInboxNote = {
  id: 'note-1',
  sender_person_id: 'sender-1',
  sender_name: 'Bui Quang Huy',
  sender_capacity: 'tl',
  submitted_at: '2026-08-18T16:06:00.000Z',
  concern_text: 'Scope changed three times after planning closed.',
  recipient_tags: ['hr', 'am', 'tl'],
  my_tags: ['hr', 'tl'],
  is_read: false,
};

describe('Morale note dialog (FUT-786)', () => {
  it('shows the note without narrating what the dialog cannot do', () => {
    render(<MoraleNoteDialog note={note} onClose={() => {}} />);

    expect(screen.getByText(note.concern_text as string)).toBeInTheDocument();

    // A standing line about a reply box that does not exist tells the reader about a
    // feature rather than about the note, and it is the last thing under the text they
    // came to read. Nothing on this surface offers to reply, so nothing has to deny it.
    expect(screen.queryByText(/not available yet/)).not.toBeInTheDocument();
  });

  it('lists every role the note reached, marking the viewer’s own', () => {
    render(<MoraleNoteDialog note={note} onClose={() => {}} />);

    // "Also received by" was true of the other roles and false of the viewer's, which is
    // the half of the list it sat above. The tags say what they are without a caption.
    expect(screen.queryByText('Also received by')).not.toBeInTheDocument();

    // HR keeps "required" even for an HR viewer: nobody chose it and nobody can remove
    // it, which outranks telling them a role they already know they hold.
    expect(screen.getByText('HR · required')).toBeInTheDocument();
    expect(screen.getByText('Team Leader · you')).toBeInTheDocument();
    // Addressed to someone else in that role — present, but not the viewer's business.
    expect(screen.getByText('Account Manager')).toBeInTheDocument();
  });

  it('closes from the footer as well as the header', async () => {
    const onClose = vi.fn();
    render(<MoraleNoteDialog note={note} onClose={onClose} />);

    // The header's ✕ answers to "Close" too — same accessible name, plus a tooltip node
    // carrying the same word — so neither the role nor the text alone picks one out. The
    // footer's is the one whose word is its own rendered label.
    await userEvent.setup().click(screen.getByText('Close', { selector: 'span' }));

    expect(onClose).toHaveBeenCalled();
  });
});
