import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { InputFormFromSchema } from './input-form-from-schema.tsx';

const NESTED_SCHEMA = {
  type: 'object',
  properties: {
    taskRef: {
      type: 'object',
      properties: {
        taskId: { type: 'string', format: 'uuid' },
        groupId: { type: 'string' },
      },
      required: ['taskId'],
      additionalProperties: false,
    },
    initiatedBy: {
      type: 'object',
      properties: {
        userId: { type: 'string' },
        via: { type: 'string', enum: ['event', 'chat', 'rerun'] },
      },
      required: ['userId', 'via'],
    },
  },
  required: ['taskRef', 'initiatedBy'],
} as const;

describe('InputFormFromSchema', () => {
  it('renders one input per leaf property and submits collected values', () => {
    const onSubmit = vi.fn();
    render(
      <InputFormFromSchema
        schema={NESTED_SCHEMA as unknown as Record<string, unknown>}
        defaults={{
          taskRef: { taskId: '11111111-1111-1111-1111-111111111111', groupId: 'g1' },
          initiatedBy: { userId: 'u1', via: 'event' },
        }}
        onSubmit={onSubmit}
      />,
    );

    expect((screen.getByLabelText('taskRef › taskId') as HTMLInputElement).value).toBe(
      '11111111-1111-1111-1111-111111111111',
    );
    expect((screen.getByLabelText('taskRef › groupId') as HTMLInputElement).value).toBe('g1');
    expect((screen.getByLabelText('initiatedBy › userId') as HTMLInputElement).value).toBe('u1');
    expect((screen.getByLabelText('initiatedBy › via') as HTMLSelectElement).value).toBe('event');

    fireEvent.change(screen.getByLabelText('initiatedBy › via'), { target: { value: 'rerun' } });
    fireEvent.click(screen.getByRole('button', { name: /submit/i }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const arg = onSubmit.mock.calls[0]?.[0] as Record<string, unknown>;
    const initiatedBy = arg.initiatedBy as Record<string, unknown>;
    expect(initiatedBy.via).toBe('rerun');
    const taskRef = arg.taskRef as Record<string, unknown>;
    expect(taskRef.taskId).toBe('11111111-1111-1111-1111-111111111111');
  });

  it('marks invalid uuid input as invalid and prevents submit', () => {
    const onSubmit = vi.fn();
    render(
      <InputFormFromSchema
        schema={NESTED_SCHEMA as unknown as Record<string, unknown>}
        defaults={{
          taskRef: { taskId: 'not-a-uuid', groupId: 'g1' },
          initiatedBy: { userId: 'u1', via: 'event' },
        }}
        onSubmit={onSubmit}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /submit/i }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText(/must be a uuid/i)).toBeInTheDocument();
  });

  it('renders `was: <prior>` strikethrough next to fields the user has changed', () => {
    render(
      <InputFormFromSchema
        schema={NESTED_SCHEMA as unknown as Record<string, unknown>}
        defaults={{
          taskRef: { taskId: '11111111-1111-1111-1111-111111111111', groupId: 'g1' },
          initiatedBy: { userId: 'u1', via: 'event' },
        }}
        original={{
          taskRef: { taskId: '11111111-1111-1111-1111-111111111111', groupId: 'g0' },
          initiatedBy: { userId: 'u1', via: 'event' },
        }}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByText(/was: g0/i)).toBeInTheDocument();
    expect(screen.queryByText(/was: 11111111/i)).not.toBeInTheDocument();
  });

  it('updates the was-marker when the user edits a previously-matching field', () => {
    render(
      <InputFormFromSchema
        schema={NESTED_SCHEMA as unknown as Record<string, unknown>}
        defaults={{
          taskRef: { taskId: '11111111-1111-1111-1111-111111111111', groupId: 'g1' },
          initiatedBy: { userId: 'u1', via: 'event' },
        }}
        original={{
          taskRef: { taskId: '11111111-1111-1111-1111-111111111111', groupId: 'g1' },
          initiatedBy: { userId: 'u1', via: 'event' },
        }}
        onSubmit={vi.fn()}
      />,
    );
    expect(screen.queryByText(/was:/i)).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('taskRef › groupId'), { target: { value: 'g2' } });
    expect(screen.getByText(/was: g1/i)).toBeInTheDocument();
  });

  it('disables the submit button while submitting', () => {
    render(
      <InputFormFromSchema
        schema={NESTED_SCHEMA as unknown as Record<string, unknown>}
        defaults={{
          taskRef: { taskId: '11111111-1111-1111-1111-111111111111' },
          initiatedBy: { userId: 'u1', via: 'event' },
        }}
        onSubmit={vi.fn()}
        submitting
      />,
    );
    expect(screen.getByRole('button', { name: /submitting/i })).toBeDisabled();
  });
});
