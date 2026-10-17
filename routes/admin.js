// Rutele panoului de administrare: proiecte, recenzii, mesaje, abonați, cereri GDPR.
import crypto from 'node:crypto';
import { site, missingConfig } from '../config/site.js';
import { getDb, update } from '../lib/store.js';
import { HttpError, readPayload, parseCookies, cookieHeader } from '../lib/http.js';
import { validate } from '../lib/validate.js';
import * as sec from '../lib/security.js';
import { sendMail, marketingFooter } from '../lib/mailer.js';
import { eraseByEmail } from '../lib/maintenance.js';
import { saveUpload, deleteUpload, isUploadUrl } from '../lib/blob.js';
import { CATEGORIES } from '../lib/render.js';

const loginLimiter = sec.rateLimiter({ windowMs: 15 * 60 * 1000, max: 6 });
const now = () => new Date().toISOString();

export function requireAdmin(ctx) {
  const token = parseCookies(ctx.req)[sec.SESSION_COOKIE];
  if (!sec.isValidSession(token)) throw new HttpError(401, 'Sesiunea a expirat. Autentifică-te din nou.');
  // Cererile care modifică date trebuie să vină din panou (antet personalizat + JSON → blocate cross-site).
  if (ctx.req.method !== 'GET' && ctx.req.headers['x-requested-with'] !== 'seecode-admin') throw new HttpError(403, 'Cerere respinsă.');
}

async function json(ctx, limit) {
  const { data, isForm } = await readPayload(ctx.req, limit);
  if (isForm) throw new HttpError(415, 'Se acceptă doar JSON.');
  return data;
}

function findOr404(list, id, what) {
  const item = list.find((x) => x.id === id);
  if (!item) throw new HttpError(404, `${what} nu există.`);
  return item;
}

const projectSchema = {
  title: { required: true, max: 120 },
  category: { required: true, oneOf: Object.keys(CATEGORIES) },
  year: { max: 4 },
  client: { max: 100 },
  summary: { required: true, max: 220 },
  description: { multiline: true, max: 3000 },
  tags: { type: 'list', maxItems: 8, maxItemLength: 30 },
  url: { type: 'url', max: 300 },
  image: { max: 200 },
  imageAlt: { max: 200 },
  demo: { type: 'bool' },
  published: { type: 'bool' },
  order: { type: 'int', min: -1000, max: 1000 },
};

function validateProject(input) {
  const { data, errors, ok } = validate(input, projectSchema);
  if (data.image && !isUploadUrl(data.image)) errors.image = 'Imagine invalidă.';
  // Textul alternativ este obligatoriu pentru orice imagine publicată (accesibilitate).
  if (data.image && !data.imageAlt) errors.imageAlt = 'Descrie imaginea pentru cititoarele de ecran (text alternativ).';
  if (data.year && !/^\d{4}$/.test(data.year)) errors.year = 'Anul are 4 cifre.';
  if (!ok || Object.keys(errors).length) throw new HttpError(422, 'Verifică câmpurile marcate.', errors);
  data.order ??= 0;
  return data;
}

// Verifică tipul real al fișierului după primii octeți, nu după extensia declarată.
function sniffImage(buf) {
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return null;
}

export const adminRoutes = [
  {
    method: 'POST',
    path: /^\/api\/admin\/login$/,
    async handler(ctx) {
      if (!loginLimiter(ctx.ip)) throw new HttpError(429, 'Prea multe încercări. Așteaptă 15 minute.');
      const data = await json(ctx, 2048);
      if (!sec.checkAdminPassword(data.password)) throw new HttpError(401, 'Parolă incorectă.');
      const s = sec.createSession();
      ctx.res.setHeader('Set-Cookie', cookieHeader(sec.SESSION_COOKIE, s.token, { maxAge: s.maxAge, secure: s.secure }));
      return { ok: true };
    },
  },
  {
    method: 'POST',
    path: /^\/api\/admin\/logout$/,
    async handler(ctx) {
      sec.destroySession(parseCookies(ctx.req)[sec.SESSION_COOKIE]);
      ctx.res.setHeader('Set-Cookie', cookieHeader(sec.SESSION_COOKIE, '', { maxAge: 0 }));
      return { ok: true };
    },
  },
  {
    method: 'GET',
    path: /^\/api\/admin\/session$/,
    handler: (ctx) => ({ authenticated: sec.isValidSession(parseCookies(ctx.req)[sec.SESSION_COOKIE]) }),
  },
  {
    method: 'GET',
    path: /^\/api\/admin\/overview$/,
    admin: true,
    handler() {
      const db = getDb();
      const days = Object.entries(db.stats).sort(([a], [b]) => a.localeCompare(b)).slice(-30);
      return {
        counts: {
          projects: db.projects.length,
          reviewsPending: db.reviews.filter((r) => r.status === 'pending').length,
          messagesNew: db.messages.filter((m) => m.status === 'new').length,
          subscribers: db.subscribers.filter((s) => s.status === 'confirmed').length,
          deletionRequests: db.deletionRequests.length,
        },
        stats: days.map(([day, s]) => ({ day, views: s.views })),
        missingConfig: missingConfig(),
        categories: CATEGORIES,
      };
    },
  },

  // ----- Proiecte -----
  { method: 'GET', path: /^\/api\/admin\/projects$/, admin: true, handler: () => ({ items: getDb().projects }) },
  {
    method: 'POST',
    path: /^\/api\/admin\/projects$/,
    admin: true,
    async handler(ctx) {
      const data = validateProject(await json(ctx));
      const item = await update((db) => {
        const p = { id: crypto.randomUUID(), ...data, createdAt: now(), updatedAt: now() };
        db.projects.push(p);
        return p;
      });
      return { status: 201, body: { item } };
    },
  },
  {
    method: 'PUT',
    path: /^\/api\/admin\/projects\/(?<id>[\w-]+)$/,
    admin: true,
    async handler(ctx) {
      const data = validateProject(await json(ctx));
      const p = findOr404(getDb().projects, ctx.params.id, 'Proiectul');
      if (p.image && p.image !== data.image) deleteUpload(p.image);
      const item = await update((db) => {
        const cur = db.projects.find((x) => x.id === p.id);
        if (cur) Object.assign(cur, data, { updatedAt: now() });
        return cur;
      });
      if (!item) throw new HttpError(404, 'Proiectul nu există.');
      return { item };
    },
  },
  {
    method: 'DELETE',
    path: /^\/api\/admin\/projects\/(?<id>[\w-]+)$/,
    admin: true,
    async handler(ctx) {
      const p = findOr404(getDb().projects, ctx.params.id, 'Proiectul');
      deleteUpload(p.image);
      await update((db) => {
        db.projects = db.projects.filter((x) => x.id !== p.id);
      });
      return { ok: true };
    },
  },
  {
    method: 'POST',
    path: /^\/api\/admin\/uploads$/,
    admin: true,
    async handler(ctx) {
      const { dataUrl } = await json(ctx, 4 * 1024 * 1024);
      const m = typeof dataUrl === 'string' && dataUrl.match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/);
      if (!m) throw new HttpError(400, 'Sunt acceptate doar imagini PNG, JPG sau WebP.');
      const buf = Buffer.from(m[2], 'base64');
      if (buf.length > 2.5 * 1024 * 1024) throw new HttpError(413, 'Imaginea depășește 2,5 MB.');
      const ext = sniffImage(buf);
      if (!ext) throw new HttpError(400, 'Fișierul nu este o imagine validă.');
      const name = `${crypto.randomUUID()}.${ext}`;
      return { status: 201, body: { url: await saveUpload(name, buf, ext) } };
    },
  },

  // ----- Recenzii -----
  { method: 'GET', path: /^\/api\/admin\/reviews$/, admin: true, handler: () => ({ items: getDb().reviews }) },
  {
    method: 'PATCH',
    path: /^\/api\/admin\/reviews\/(?<id>[\w-]+)$/,
    admin: true,
    async handler(ctx) {
      const input = await json(ctx);
      findOr404(getDb().reviews, ctx.params.id, 'Recenzia');
      const { data, errors, ok } = validate(input, {
        status: { oneOf: ['pending', 'approved', 'rejected'] },
        reply: { multiline: true, max: 600 },
        verified: { type: 'bool' },
      });
      if (!ok) throw new HttpError(422, 'Date invalide.', errors);
      const item = await update((db) => {
        const r = db.reviews.find((x) => x.id === ctx.params.id);
        if (!r) return null;
        if (data.status && data.status !== r.status) {
          r.status = data.status;
          r.moderatedAt = now();
          if (data.status === 'approved') r.publishedAt = r.publishedAt || now();
        }
        if ('reply' in input) r.reply = data.reply;
        if ('verified' in input) r.verified = data.verified;
        return r;
      });
      if (!item) throw new HttpError(404, 'Recenzia nu există.');
      return { item };
    },
  },
  {
    method: 'DELETE',
    path: /^\/api\/admin\/reviews\/(?<id>[\w-]+)$/,
    admin: true,
    async handler(ctx) {
      findOr404(getDb().reviews, ctx.params.id, 'Recenzia');
      await update((db) => {
        db.reviews = db.reviews.filter((x) => x.id !== ctx.params.id);
      });
      return { ok: true };
    },
  },

  // ----- Mesaje -----
  { method: 'GET', path: /^\/api\/admin\/messages$/, admin: true, handler: () => ({ items: [...getDb().messages].reverse() }) },
  {
    method: 'PATCH',
    path: /^\/api\/admin\/messages\/(?<id>[\w-]+)$/,
    admin: true,
    async handler(ctx) {
      const { status } = await json(ctx);
      if (!['new', 'read', 'answered'].includes(status)) throw new HttpError(422, 'Status invalid.');
      findOr404(getDb().messages, ctx.params.id, 'Mesajul');
      const item = await update((db) => {
        const m = db.messages.find((x) => x.id === ctx.params.id);
        if (m) m.status = status;
        return m;
      });
      if (!item) throw new HttpError(404, 'Mesajul nu există.');
      return { item };
    },
  },
  {
    method: 'DELETE',
    path: /^\/api\/admin\/messages\/(?<id>[\w-]+)$/,
    admin: true,
    async handler(ctx) {
      findOr404(getDb().messages, ctx.params.id, 'Mesajul');
      await update((db) => {
        db.messages = db.messages.filter((x) => x.id !== ctx.params.id);
      });
      return { ok: true };
    },
  },

  // ----- Newsletter -----
  { method: 'GET', path: /^\/api\/admin\/subscribers$/, admin: true, handler: () => ({ items: getDb().subscribers }) },
  {
    method: 'DELETE',
    path: /^\/api\/admin\/subscribers\/(?<id>[\w-]+)$/,
    admin: true,
    async handler(ctx) {
      await update((db) => {
        db.subscribers = db.subscribers.filter((x) => x.id !== ctx.params.id);
      });
      return { ok: true };
    },
  },
  {
    method: 'POST',
    path: /^\/api\/admin\/newsletter\/send$/,
    admin: true,
    async handler(ctx) {
      const { data, errors, ok } = validate(await json(ctx), {
        subject: { required: true, max: 150 },
        body: { required: true, multiline: true, max: 20000 },
      });
      if (!ok) throw new HttpError(422, 'Completează subiectul și conținutul.', errors);
      const recipients = getDb().subscribers.filter((s) => s.status === 'confirmed');
      let sent = 0;
      for (const s of recipients) {
        const token = sec.signToken('unsubscribe', s.id);
        const pageUrl = `${site.baseUrl}/dezabonare?token=${token}`;
        const oneClickUrl = `${site.baseUrl}/api/newsletter/unsubscribe?token=${token}`;
        try {
          await sendMail({
            to: s.email,
            subject: data.subject,
            text: data.body + '\n' + marketingFooter(pageUrl),
            // Gmail, Outlook etc. afișează un buton „Dezabonare” pe baza acestor antete.
            headers: { 'List-Unsubscribe': `<${oneClickUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
          });
          sent += 1;
        } catch (e) {
          console.error('[newsletter]', s.email, e.message);
        }
      }
      return { ok: true, sent, total: recipients.length };
    },
  },

  // ----- GDPR: acces și ștergere -----
  {
    method: 'GET',
    path: /^\/api\/admin\/deletion-requests$/,
    admin: true,
    handler: () => ({ items: getDb().deletionRequests, log: getDb().deletionLog.slice(-50).reverse() }),
  },
  {
    method: 'POST',
    path: /^\/api\/admin\/erase$/,
    admin: true,
    async handler(ctx) {
      const { data, errors, ok } = validate(await json(ctx), { email: { type: 'email', required: true } });
      if (!ok) throw new HttpError(422, 'Email invalid.', errors);
      const counts = await eraseByEmail(data.email, 'administrator');
      await update((db) => {
        db.deletionRequests = db.deletionRequests.filter((r) => r.email !== data.email);
      });
      return { ok: true, counts };
    },
  },
  {
    // Export pentru cererile de acces (art. 15 GDPR) — tot ce avem despre o adresă de email.
    method: 'GET',
    path: /^\/api\/admin\/export$/,
    admin: true,
    handler(ctx) {
      const email = (ctx.url.searchParams.get('email') || '').trim().toLowerCase();
      if (!email) throw new HttpError(422, 'Introdu adresa de email.');
      const db = getDb();
      return {
        email,
        exportedAt: now(),
        messages: db.messages.filter((m) => m.email === email),
        reviews: db.reviews.filter((r) => r.email === email),
        subscribers: db.subscribers.filter((s) => s.email === email),
      };
    },
  },
];
