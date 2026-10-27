import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';

const N = 16384;
const R = 8;
const P = 1;
const KEYLEN = 64;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, KEYLEN, { N, r: R, p: P }).toString('hex');
  return `scrypt$${N}$${R}$${P}$${salt}$${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    const [scheme, nStr, rStr, pStr, salt, hash] = stored.split('$');
    if (scheme !== 'scrypt' || !salt || !hash) return false;
    const derived = scryptSync(password, salt, KEYLEN, {
      N: Number(nStr),
      r: Number(rStr),
      p: Number(pStr),
    });
    const expected = Buffer.from(hash, 'hex');
    return expected.length === derived.length && timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}
