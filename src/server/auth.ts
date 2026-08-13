import { createHash, randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import type { AstroCookies } from 'astro';
import database from './db';

const scrypt = (password: string, salt: Buffer, options: { N: number; r: number; p: number; maxmem: number }) => new Promise<Buffer>((resolve, reject) => {
  scryptCallback(password, salt, 64, options, (error, derived) => error ? reject(error) : resolve(Buffer.from(derived)));
});
const SESSION_DAYS = 30;
const SCRYPT_COST = 32768;
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELISM = 1;
const SESSION_COOKIE = import.meta.env.PROD ? '__Host-iko_session' : 'iko_session';
const DUMMY_SALT = Buffer.from('iko-connect-login', 'utf8');

export type AuthUser = { id: string; email: string; displayName: string };
export type AuthSession = { user: AuthUser; csrfToken: string; expiresAt: number };

type UserRow = { id: string; email: string; display_name: string; password_hash: string };
type SessionRow = UserRow & { csrf_token: string; expires_at: number };

const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
const passwordBytes = (password: string) => Buffer.byteLength(password, 'utf8');

export const normalizeEmail = (email: string) => email.trim().toLowerCase();
export const validateRegistration = (input: { email: string; displayName: string; password: string }) => {
  const email = normalizeEmail(input.email), displayName = input.displayName.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return { error: 'Enter a valid email address.' } as const;
  if (displayName.length < 2 || displayName.length > 80) return { error: 'Your name must be between 2 and 80 characters.' } as const;
  if (input.password.length < 12) return { error: 'Use at least 12 characters for your password.' } as const;
  if (passwordBytes(input.password) > 256) return { error: 'Password is too long.' } as const;
  return { email, displayName, password: input.password } as const;
};

const derivePassword = async (password: string, salt: Buffer, cost = SCRYPT_COST, blockSize = SCRYPT_BLOCK_SIZE, parallelism = SCRYPT_PARALLELISM) =>
  scrypt(password, salt, { N: cost, r: blockSize, p: parallelism, maxmem: 64 * 1024 * 1024 });

export const hashPassword = async (password: string) => {
  const salt = randomBytes(16), derived = await derivePassword(password, salt);
  return `scrypt$${SCRYPT_COST}$${SCRYPT_BLOCK_SIZE}$${SCRYPT_PARALLELISM}$${salt.toString('base64url')}$${derived.toString('base64url')}`;
};

const verifyPassword = async (password: string, encoded?: string) => {
  if (!encoded) { await derivePassword(password, DUMMY_SALT); return false; }
  const [algorithm, cost, blockSize, parallelism, saltText, hashText] = encoded.split('$');
  if (algorithm !== 'scrypt' || !saltText || !hashText) { await derivePassword(password, DUMMY_SALT); return false; }
  try {
    const expected = Buffer.from(hashText, 'base64url');
    const actual = await derivePassword(password, Buffer.from(saltText, 'base64url'), Number(cost), Number(blockSize), Number(parallelism));
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch { return false; }
};

export const createUser = async (input: { email: string; displayName: string; password: string }) => {
  const valid = validateRegistration(input);
  if ('error' in valid) return valid;
  const id = randomUUID(), now = Date.now(), passwordHash = await hashPassword(valid.password);
  try {
    database.prepare('INSERT INTO users (id, email, display_name, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, valid.email, valid.displayName, passwordHash, now, now);
    return { user: { id, email: valid.email, displayName: valid.displayName } satisfies AuthUser } as const;
  } catch (error) {
    if (String(error).includes('UNIQUE')) return { error: 'Unable to create the account with those details.' } as const;
    throw error;
  }
};

export const authenticateUser = async (emailInput: string, password: string) => {
  const email = normalizeEmail(emailInput);
  const row = database.prepare('SELECT id, email, display_name, password_hash FROM users WHERE email = ?').get(email) as UserRow | undefined;
  const valid = await verifyPassword(password, row?.password_hash);
  return valid && row ? { id: row.id, email: row.email, displayName: row.display_name } satisfies AuthUser : null;
};

const cookieOptions = (expires: Date) => ({
  httpOnly: true,
  secure: import.meta.env.PROD,
  sameSite: 'lax' as const,
  path: '/',
  expires,
});

export const createSession = (userId: string, cookies: AstroCookies) => {
  const token = randomBytes(32).toString('base64url'), csrfToken = randomBytes(24).toString('base64url');
  const now = Date.now(), expiresAt = now + SESSION_DAYS * 24 * 60 * 60 * 1000;
  database.prepare('INSERT INTO sessions (token_hash, user_id, csrf_token, expires_at, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(tokenHash(token), userId, csrfToken, expiresAt, now);
  cookies.set(SESSION_COOKIE, token, cookieOptions(new Date(expiresAt)));
  return csrfToken;
};

export const readSession = (cookies: AstroCookies): AuthSession | null => {
  const token = cookies.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const row = database.prepare(`SELECT users.id, users.email, users.display_name, users.password_hash, sessions.csrf_token, sessions.expires_at
    FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.token_hash = ? AND sessions.expires_at > ?`)
    .get(tokenHash(token), Date.now()) as SessionRow | undefined;
  if (!row) { cookies.delete(SESSION_COOKIE, { path: '/' }); return null; }
  return { user: { id: row.id, email: row.email, displayName: row.display_name }, csrfToken: row.csrf_token, expiresAt: row.expires_at };
};

export const destroySession = (cookies: AstroCookies) => {
  const token = cookies.get(SESSION_COOKIE)?.value;
  if (token) database.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash(token));
  cookies.delete(SESSION_COOKIE, { path: '/' });
};

export const isSameOrigin = (request: Request) => {
  const source = request.headers.get('origin') ?? request.headers.get('referer');
  if (!source) return false;
  try { return new URL(source).origin === new URL(request.url).origin; } catch { return false; }
};

export const verifyCsrf = (request: Request, session: AuthSession | null, submitted: unknown) =>
  !!session && isSameOrigin(request) && typeof submitted === 'string' && submitted.length === session.csrfToken.length
  && timingSafeEqual(Buffer.from(submitted), Buffer.from(session.csrfToken));
