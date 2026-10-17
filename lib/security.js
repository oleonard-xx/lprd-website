import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from './store.js';

const isProd = process.env.NODE_ENV === 'production';

// ---------- Secretul aplicației (semnează linkurile din emailuri) ----------
const SECRET_FILE = path.join(DATA_DIR, 'secret.key');
const SECRET = (() => {
  if (process.env.APP_SECRET) return process.env.APP_SECRET;
  if (fs.existsSync(SECRET_FILE)) return fs.readFileSync(SECRET_FILE, 'utf8').trim();
  const s = crypto.randomBytes(48).toString('base64url');
  fs.writeFileSync(SECRET_FILE, s, { mode: 0o600 });
  return s;
})();

const hmac = (value) => crypto.createHmac('sha256', SECRET).update(value).digest('base64url');

// Token semnat „id.semnătură”, legat de un scop — nu trebuie stocat în baza de date.
export function signToken(purpose, id) {
  return `${id}.${hmac(`${purpose}:${id}`)}`;
}

export function verifyToken(purpose, token) {
  if (typeof token !== 'string' || token.length > 200) return null;
  const i = token.lastIndexOf('.');
  if (i < 1) return null;
  const id = token.slice(0, i);
  const expected = Buffer.from(hmac(`${purpose}:${id}`));
  const given = Buffer.from(token.slice(i + 1));
  return expected.length === given.length && crypto.timingSafeEqual(expected, given) ? id : null;
}

// Pentru jurnalul de ștergeri păstrăm doar amprenta emailului, nu emailul.
export const hashEmail = (email) => hmac(`email:${email.trim().toLowerCase()}`);

// ---------- Parola de administrator ----------
const ADMIN_FILE = path.join(DATA_DIR, 'admin.json');

export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return { salt: salt.toString('base64'), hash: hash.toString('base64') };
}

export function saveAdminPassword(password) {
  fs.writeFileSync(ADMIN_FILE, JSON.stringify(hashPassword(password)), { mode: 0o600 });
}

// La prima pornire: folosește ADMIN_PASSWORD sau generează o parolă și o afișează o singură dată.
export function ensureAdminPassword() {
  if (fs.existsSync(ADMIN_FILE)) return null;
  const password = process.env.ADMIN_PASSWORD || crypto.randomBytes(12).toString('base64url');
  saveAdminPassword(password);
  return process.env.ADMIN_PASSWORD ? null : password;
}

export function checkAdminPassword(password) {
  if (typeof password !== 'string' || !fs.existsSync(ADMIN_FILE)) return false;
  const { salt, hash } = JSON.parse(fs.readFileSync(ADMIN_FILE, 'utf8'));
  const actual = crypto.scryptSync(password, Buffer.from(salt, 'base64'), 64, { N: 16384, r: 8, p: 1 });
  return crypto.timingSafeEqual(actual, Buffer.from(hash, 'base64'));
}

// ---------- Sesiuni de administrator (în memorie) ----------
const SESSION_TTL = 8 * 60 * 60 * 1000;
const sessions = new Map();
export const SESSION_COOKIE = 'seecode_admin';

export function createSession() {
  const token = crypto.randomBytes(32).toString('base64url');
  sessions.set(token, Date.now() + SESSION_TTL);
  return { token, maxAge: SESSION_TTL / 1000, secure: isProd };
}

export function isValidSession(token) {
  const exp = token && sessions.get(token);
  if (!exp) return false;
  if (exp < Date.now()) {
    sessions.delete(token);
    return false;
  }
  return true;
}

export const destroySession = (token) => sessions.delete(token);

// ---------- Limitarea numărului de cereri ----------
export function rateLimiter({ windowMs, max }) {
  const hits = new Map();
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
  }, windowMs).unref();
  return (key) => {
    const now = Date.now();
    const entry = hits.get(key);
    if (!entry || entry.reset < now) {
      hits.set(key, { count: 1, reset: now + windowMs });
      return true;
    }
    entry.count += 1;
    return entry.count <= max;
  };
}

// ---------- Antete de securitate ----------
// CSP strict: doar resurse proprii. Orice SDK terț adăugat ulterior va fi blocat până e trecut explicit aici.
export function securityHeaders(res) {
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self'",
      `img-src 'self' data: blob:${process.env.BLOB_READ_WRITE_TOKEN ? ' https://*.public.blob.vercel-storage.com' : ''}`,
      "font-src 'self'",
      "connect-src 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "object-src 'none'",
    ].join('; ')
  );
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), interest-cohort=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  if (isProd) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
}

// Respinge cererile care modifică date și vin de pe alt domeniu (protecție CSRF).
export function isSameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true; // formularele HTML simple din unele browsere nu trimit Origin
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}
