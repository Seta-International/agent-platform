import { hash, verify } from '@node-rs/argon2';

// Algorithm.Argon2id = 2; const enum cannot be used across module boundaries with isolatedModules
const ARGON2ID = 2;

export const argon2id = {
  hash: (pw: string): Promise<string> =>
    hash(pw, {
      algorithm: ARGON2ID,
      memoryCost: 19_456,
      timeCost: 2,
      parallelism: 1,
    }),
  verify: (passwordHash: string, pw: string): Promise<boolean> => verify(passwordHash, pw),
};
