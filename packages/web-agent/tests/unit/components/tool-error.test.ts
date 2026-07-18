import { describe, expect, it } from 'vitest';
import { toolErrorMessage } from '../../../src/components/tool-renderers/tool-error';

describe('toolErrorMessage', () => {
  it('returns a plain string error verbatim', () => {
    expect(toolErrorMessage('Rate limit exceeded')).toBe('Rate limit exceeded');
  });
  it('reads { message }', () => {
    expect(toolErrorMessage({ message: 'Task not found' })).toBe('Task not found');
  });
  it('reads { error } and { reason }', () => {
    expect(toolErrorMessage({ error: 'boom' })).toBe('boom');
    expect(toolErrorMessage({ reason: 'declined' })).toBe('declined');
  });
  it('unwraps a nested { error: { message } }', () => {
    expect(toolErrorMessage({ error: { message: 'deep failure' } })).toBe('deep failure');
  });
  it('compactly stringifies an unrecognized object', () => {
    expect(toolErrorMessage({ code: 500 })).toBe('{"code":500}');
  });
  it('falls back to "failed" for null/empty', () => {
    expect(toolErrorMessage(null)).toBe('failed');
    expect(toolErrorMessage('   ')).toBe('failed');
    expect(toolErrorMessage(undefined)).toBe('failed');
  });
});
