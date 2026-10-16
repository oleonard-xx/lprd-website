// Utilitare HTTP mici: corpul cererii, răspunsuri, cookie-uri.

export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

export function sendHtml(res, status, html, extraHeaders = {}) {
  res.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Length': Buffer.byteLength(html),
    'Cache-Control': 'no-cache',
    ...extraHeaders,
  });
  res.end(html);
}

export function redirect(res, location, status = 303) {
  res.writeHead(status, { Location: location });
  res.end();
}

export function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const declared = Number(req.headers['content-length'] || 0);
    if (declared > limit) return reject(new HttpError(413, 'Cererea este prea mare.'));
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new HttpError(413, 'Cererea este prea mare.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// Acceptă JSON (fetch) și application/x-www-form-urlencoded (formulare fără JavaScript).
export async function readPayload(req, limit = 32 * 1024) {
  const type = (req.headers['content-type'] || '').split(';')[0].trim();
  const raw = (await readBody(req, limit)).toString('utf8');
  if (type === 'application/json') {
    try {
      const data = JSON.parse(raw || '{}');
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error();
      return { data, isForm: false };
    } catch {
      throw new HttpError(400, 'JSON invalid.');
    }
  }
  if (type === 'application/x-www-form-urlencoded') {
    const data = {};
    for (const [k, v] of new URLSearchParams(raw)) data[k] = v;
    return { data, isForm: true };
  }
  throw new HttpError(415, 'Tip de conținut neacceptat.');
}

export function parseCookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function cookieHeader(name, value, { maxAge, secure, httpOnly = true, sameSite = 'Strict', path = '/' } = {}) {
  let c = `${name}=${encodeURIComponent(value)}; Path=${path}; SameSite=${sameSite}`;
  if (maxAge !== undefined) c += `; Max-Age=${maxAge}`;
  if (httpOnly) c += '; HttpOnly';
  if (secure) c += '; Secure';
  return c;
}

export function clientIp(req) {
  // X-Forwarded-For e luat în calcul doar în spatele unui reverse proxy de încredere (TRUST_PROXY=1),
  // altfel oricine l-ar putea falsifica pentru a ocoli limitarea de cereri.
  const fwd = req.headers['x-forwarded-for'];
  if (process.env.TRUST_PROXY === '1' && typeof fwd === 'string') return fwd.split(',')[0].trim();
  return req.socket.remoteAddress || 'unknown';
}
