import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ExpandableRow } from '../../../src/composites/expandable-row';

const noop = () => {};

describe('ExpandableRow', () => {
  it('collapsed: shows label, value, and an Edit button', async () => {
    const onEdit = vi.fn();
    render(
      <ExpandableRow
        label="Legal name"
        value="Alex Johnson"
        isExpanded={false}
        onEdit={onEdit}
        onCancel={noop}
        onSave={noop}
      >
        <input aria-label="editor" />
      </ExpandableRow>,
    );
    expect(screen.getByText('Alex Johnson')).toBeInTheDocument();
    expect(screen.queryByLabelText('editor')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(onEdit).toHaveBeenCalledOnce();
  });

  it('expanded: shows children with Save and Cancel', async () => {
    const onSave = vi.fn();
    const onCancel = vi.fn();
    render(
      <ExpandableRow
        label="Legal name"
        value="Alex Johnson"
        isExpanded
        onEdit={noop}
        onCancel={onCancel}
        onSave={onSave}
      >
        <input aria-label="editor" />
      </ExpandableRow>,
    );
    expect(screen.getByLabelText('editor')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenCalledOnce();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('isSaving disables Save and Cancel', () => {
    render(
      <ExpandableRow
        label="Legal name"
        value="Alex Johnson"
        isExpanded
        isSaving
        onEdit={noop}
        onCancel={noop}
        onSave={noop}
      >
        <input aria-label="editor" />
      </ExpandableRow>,
    );
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  });
});
