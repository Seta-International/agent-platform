import { describe, expect, it } from 'vitest';
import { isEncryptedBlob, parseEncryptedBlob } from '../src/blob.ts';

const VALID = {
  v: 1,
  alg: 'A256GCM',
  kid: 'env:demo-2026',
  wdk: 'YWFhYQ',
  iv: 'YWFhYWFhYWFhYWFh',
  ct: 'Y2lwaGVy',
  tag: 'YWFhYWFhYWFhYWFhYWFhYW',
};

describe('parseEncryptedBlob', () => {
  it('accepts a valid blob', () => {
    expect(parseEncryptedBlob(VALID)).toEqual(VALID);
  });

  it('rejects wrong v', () => {
    expect(() => parseEncryptedBlob({ ...VALID, v: 2 })).toThrowError(/BLOB_PARSE_FAILED/);
  });

  it('rejects wrong alg', () => {
    expect(() => parseEncryptedBlob({ ...VALID, alg: 'A128GCM' })).toThrowError(
      /BLOB_PARSE_FAILED/,
    );
  });

  it('rejects missing field', () => {
    const { tag: _omit, ...broken } = VALID;
    expect(() => parseEncryptedBlob(broken)).toThrowError(/BLOB_PARSE_FAILED/);
  });

  it('rejects kid without env:/kms: prefix', () => {
    expect(() => parseEncryptedBlob({ ...VALID, kid: 'other:foo' })).toThrowError(
      /BLOB_PARSE_FAILED/,
    );
  });

  it('rejects non-base64url chars in ct', () => {
    expect(() => parseEncryptedBlob({ ...VALID, ct: 'has space' })).toThrowError(
      /BLOB_PARSE_FAILED/,
    );
  });

  it('rejects wrong iv length', () => {
    expect(() => parseEncryptedBlob({ ...VALID, iv: 'shrt' })).toThrowError(/BLOB_PARSE_FAILED/);
  });

  it('rejects wrong tag length', () => {
    expect(() => parseEncryptedBlob({ ...VALID, tag: 'shrt' })).toThrowError(/BLOB_PARSE_FAILED/);
  });

  it('isEncryptedBlob returns true for valid, false for invalid', () => {
    expect(isEncryptedBlob(VALID)).toBe(true);
    expect(isEncryptedBlob({})).toBe(false);
    expect(isEncryptedBlob(null)).toBe(false);
    expect(isEncryptedBlob('string')).toBe(false);
  });
});
