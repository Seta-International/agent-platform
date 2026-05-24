import { randomBytes } from 'node:crypto';

const ALPHABET = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789-_';
const ALPHA_LEN = ALPHABET.length;
const REJECT_THRESHOLD = 256 - (256 % ALPHA_LEN);

export function generateRandomPassword(length = 32): string {
  let out = '';
  while (out.length < length) {
    const buf = randomBytes(length - out.length);
    for (let i = 0; i < buf.length && out.length < length; i++) {
      const b = buf[i] as number;
      if (b < REJECT_THRESHOLD) out += ALPHABET[b % ALPHA_LEN];
    }
  }
  return out;
}
