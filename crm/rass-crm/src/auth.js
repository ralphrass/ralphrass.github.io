// Login por e-mail e senha, com sessão em cookie httpOnly.
import crypto from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(crypto.scrypt);
export const SESSION_COOKIE = 'sessao';
export const SESSION_DAYS = 30;

export async function hashPassword(senha) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(senha, salt, 64);
  return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`;
}

export async function checkPassword(senha, stored) {
  const [alg, saltHex, keyHex] = String(stored).split('$');
  if (alg !== 'scrypt' || !saltHex || !keyHex) return false;
  const key = await scrypt(senha, Buffer.from(saltHex, 'hex'), 64);
  const ref = Buffer.from(keyHex, 'hex');
  return ref.length === key.length && crypto.timingSafeEqual(ref, key);
}

export const newToken = () => crypto.randomBytes(32).toString('base64url');
export const tokenId = token => crypto.createHash('sha256').update(token).digest('hex');

// Limite simples de tentativas de login por IP + e-mail (em memória).
const attempts = new Map();
export function tooManyAttempts(key) {
  const now = Date.now(), win = 15 * 60 * 1000;
  const a = (attempts.get(key) || []).filter(t => now - t < win);
  attempts.set(key, a);
  return a.length >= 10;
}
export function recordFailure(key) {
  const a = attempts.get(key) || [];
  a.push(Date.now());
  attempts.set(key, a);
}
export const clearFailures = key => attempts.delete(key);
