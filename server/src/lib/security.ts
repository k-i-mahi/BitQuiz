import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

/** URL-safe random token, used for participant devices and projector links. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

// No 0/O/1/I so codes read cleanly off a projector.
const JOIN_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateJoinCode(length = 6): string {
  let code = '';
  for (let i = 0; i < length; i++) code += JOIN_CODE_ALPHABET[randomInt(JOIN_CODE_ALPHABET.length)];
  return code;
}

export interface SessionPayload {
  /** Admin user id. */
  uid: string;
  /** Must match AdminUser.sessionVersion; bumping it logs out every session. */
  ver: number;
  /** Expiry, ms since epoch. */
  exp: number;
}

/** Signs a session payload as `base64url(json).base64url(hmac)`. */
export function signSession(payload: SessionPayload, secret: string): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${hmac(body, secret)}`;
}

export function verifySession(token: string | undefined, secret: string, now = Date.now()): SessionPayload | null {
  if (!token) return null;
  const [body, signature] = token.split('.');
  if (!body || !signature) return null;
  const expected = Buffer.from(hmac(body, secret));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as SessionPayload;
    if (typeof payload.uid !== 'string' || typeof payload.exp !== 'number' || payload.exp < now) return null;
    return payload;
  } catch {
    return null;
  }
}

function hmac(value: string, secret: string): string {
  return createHmac('sha256', secret).update(value).digest('base64url');
}
