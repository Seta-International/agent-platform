import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { FieldConflictRow } from './field-conflict-row';

describe('FieldConflictRow', () => {
  it('renders the field name, local & remote values, and 2 radio options', () => {
    render(
      <FieldConflictRow
        field="name"
        local="Engineering"
        remote="Eng M365"
        choice={null}
        onChoose={() => {}}
      />,
    );
    expect(screen.getByText('name')).toBeInTheDocument();
    expect(screen.getByText('Engineering')).toBeInTheDocument();
    expect(screen.getByText('Eng M365')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Use Seta/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Use M365/i })).toBeInTheDocument();
  });

  it('displays "—" for null, undefined, and empty string values', () => {
    const { rerender } = render(
      <FieldConflictRow
        field="due_at"
        local={null}
        remote={undefined}
        choice={null}
        onChoose={() => {}}
      />,
    );
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThanOrEqual(2);

    rerender(
      <FieldConflictRow field="due_at" local="" remote={null} choice={null} onChoose={() => {}} />,
    );
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(2);
  });

  it('shows snapshot column when snapshot prop is provided', () => {
    render(
      <FieldConflictRow
        field="name"
        local="A"
        remote="B"
        snapshot="C"
        choice={null}
        onChoose={() => {}}
      />,
    );
    expect(screen.getByText('Last synced')).toBeInTheDocument();
    expect(screen.getByText('C')).toBeInTheDocument();
  });

  it('omits snapshot column when snapshot is undefined', () => {
    render(
      <FieldConflictRow field="name" local="A" remote="B" choice={null} onChoose={() => {}} />,
    );
    expect(screen.queryByText('Last synced')).not.toBeInTheDocument();
  });

  it('clicking "Use Seta" radio calls onChoose("local")', async () => {
    const user = userEvent.setup();
    const onChoose = vi.fn();
    render(
      <FieldConflictRow
        field="name"
        local="Engineering"
        remote="Eng M365"
        choice={null}
        onChoose={onChoose}
      />,
    );
    await user.click(screen.getByRole('radio', { name: /Use Seta/i }));
    expect(onChoose).toHaveBeenCalledWith('local');
  });

  it('clicking "Use M365" radio calls onChoose("remote")', async () => {
    const user = userEvent.setup();
    const onChoose = vi.fn();
    render(
      <FieldConflictRow
        field="name"
        local="Engineering"
        remote="Eng M365"
        choice={null}
        onChoose={onChoose}
      />,
    );
    await user.click(screen.getByRole('radio', { name: /Use M365/i }));
    expect(onChoose).toHaveBeenCalledWith('remote');
  });

  it('choice="local" renders local radio as checked', () => {
    render(
      <FieldConflictRow
        field="name"
        local="Engineering"
        remote="Eng M365"
        choice="local"
        onChoose={() => {}}
      />,
    );
    const localRadio = screen.getByRole('radio', { name: /Use Seta/i });
    const remoteRadio = screen.getByRole('radio', { name: /Use M365/i });
    expect(localRadio).toHaveAttribute('data-state', 'checked');
    expect(remoteRadio).toHaveAttribute('data-state', 'unchecked');
  });

  it('choice="remote" renders remote radio as checked', () => {
    render(
      <FieldConflictRow
        field="name"
        local="Engineering"
        remote="Eng M365"
        choice="remote"
        onChoose={() => {}}
      />,
    );
    const localRadio = screen.getByRole('radio', { name: /Use Seta/i });
    const remoteRadio = screen.getByRole('radio', { name: /Use M365/i });
    expect(localRadio).toHaveAttribute('data-state', 'unchecked');
    expect(remoteRadio).toHaveAttribute('data-state', 'checked');
  });

  it('choice=null renders neither radio as checked', () => {
    render(
      <FieldConflictRow
        field="name"
        local="Engineering"
        remote="Eng M365"
        choice={null}
        onChoose={() => {}}
      />,
    );
    const localRadio = screen.getByRole('radio', { name: /Use Seta/i });
    const remoteRadio = screen.getByRole('radio', { name: /Use M365/i });
    expect(localRadio).toHaveAttribute('data-state', 'unchecked');
    expect(remoteRadio).toHaveAttribute('data-state', 'unchecked');
  });
});
