// Rute publice: contact, recenzii, newsletter, ștergerea datelor, statistici anonime.
import crypto from 'node:crypto';
import { site } from '../config/site.js';
import { getDb, update } from '../lib/store.js';
import { HttpError, readPayload, redirect } from '../lib/http.js';
import { validate } from '../lib/validate.js';
import { rateLimiter, signToken, verifyToken } from '../lib/security.js';
import { sendMail } from '../lib/mailer.js';
import { eraseByEmail } from '../lib/maintenance.js';

const formLimiter = rateLimiter({ windowMs: 10 * 60 * 1000, max: 8 });
const statsLimiter = rateLimiter({ windowMs: 60 * 1000, max: 30 });

const AGE_MSG = `Trebuie să confirmi că ai cel puțin ${site.legal.minAge} ani.`;
const PRIVACY_MSG = 'Este necesar acordul cu prelucrarea datelor pentru a-ți putea răspunde.';
const now = () => new Date().toISOString();
const companyInbox = () => (/^\[.*\]$/.test(site.company.email) ? null : site.company.email);

function guard(ctx) {
  if (!formLimiter(ctx.ip)) throw new HttpError(429, 'Prea multe trimiteri într-un timp scurt. Încearcă din nou în câteva minute.');
}

// Roboții completează câmpul ascuns „fax” sau trimit formularul instantaneu.
const looksLikeBot = (data) => Boolean(data.fax) || (data.t !== undefined && Number(data.t) < 2500);

function done(ctx, isForm, form, message) {
  if (isForm) {
    redirect(ctx.res, `/multumim?form=${form}`);
    return undefined;
  }
  return { ok: true, message };
}

function fail(errors) {
  throw new HttpError(422, 'Te rugăm să corectezi câmpurile marcate.', errors);
}

async function sendNewsletterConfirmation(sub) {
  const link = `${site.baseUrl}/newsletter/confirmare?token=${signToken('confirm', sub.id)}`;
  await sendMail({
    to: sub.email,
    subject: `Confirmă abonarea la newsletterul ${site.brand}`,
    text: `Bună!\n\nCineva (sperăm că tu) a cerut abonarea acestei adrese la newsletterul ${site.brand}.\nPentru a confirma, deschide linkul:\n${link}\n\nDacă nu ai cerut tu, ignoră acest email — nu te vom abona și adresa va fi ștearsă automat în ${site.legal.retention.pendingDays} zile.\n\n${site.company.legalName} · ${site.company.address}`,
  });
}

async function subscribe(email, source) {
  const db = getDb();
  const existing = db.subscribers.find((s) => s.email === email);
  if (existing?.status === 'confirmed') return;
  const sub =
    existing ||
    (await update((d) => {
      const s = { id: crypto.randomUUID(), email, status: 'pending', source, createdAt: now(), consentAt: now() };
      d.subscribers.push(s);
      return s;
    }));
  await sendNewsletterConfirmation(sub);
}

export const publicRoutes = [
  {
    method: 'POST',
    path: /^\/api\/contact$/,
    async handler(ctx) {
      guard(ctx);
      const { data: input, isForm } = await readPayload(ctx.req);
      if (looksLikeBot(input)) return done(ctx, isForm, 'contact', 'Mulțumim!');
      const { data, errors, ok } = validate(input, {
        firstName: { required: true, max: 60 },
        lastName: { required: true, max: 60 },
        company: { max: 120 },
        email: { type: 'email', required: true, max: 160 },
        phone: { type: 'phone', max: 20 },
        website: { type: 'url', max: 200 },
        message: { multiline: true, max: 750 },
        consentPrivacy: { type: 'bool', mustBeTrue: true, message: PRIVACY_MSG },
        ageConfirm: { type: 'bool', mustBeTrue: true, message: AGE_MSG },
        newsletter: { type: 'bool' },
      });
      if (!ok) fail(errors);

      const { consentPrivacy, ageConfirm, newsletter, ...fields } = data;
      const msg = await update((db) => {
        const m = { id: crypto.randomUUID(), ...fields, status: 'new', createdAt: now() };
        db.messages.push(m);
        return m;
      });

      const inbox = companyInbox();
      if (inbox) {
        await sendMail({
          to: inbox,
          subject: `Cerere nouă de ofertă: ${msg.firstName} ${msg.lastName}${msg.company ? ` (${msg.company})` : ''}`,
          text: [
            `Nume: ${msg.firstName} ${msg.lastName}`,
            `Firmă: ${msg.company || '—'}`,
            `Email: ${msg.email}`,
            `Telefon: ${msg.phone || '—'}`,
            `Site: ${msg.website || '—'}`,
            '',
            msg.message || '(fără descriere)',
            '',
            `Vezi în panoul de administrare: ${site.baseUrl}/admin`,
          ].join('\n'),
          headers: { 'Reply-To': msg.email },
        }).catch((e) => console.error('[mail]', e.message));
      }
      if (newsletter) await subscribe(msg.email, 'contact').catch((e) => console.error('[mail]', e.message));

      return done(ctx, isForm, 'contact', 'Mulțumim! Mesajul tău a ajuns la noi și îți răspundem în zilele lucrătoare.');
    },
  },
  {
    method: 'POST',
    path: /^\/api\/reviews$/,
    async handler(ctx) {
      guard(ctx);
      const { data: input, isForm } = await readPayload(ctx.req);
      if (looksLikeBot(input)) return done(ctx, isForm, 'review', 'Mulțumim!');
      const { data, errors, ok } = validate(input, {
        name: { required: true, max: 60 },
        role: { max: 60 },
        company: { max: 80 },
        email: { type: 'email', required: true, max: 160 },
        rating: { type: 'int', min: 1, max: 5, required: true, message: 'Alege o notă de la 1 la 5.' },
        text: { multiline: true, required: true, min: 20, max: 600 },
        consentPublish: { type: 'bool', mustBeTrue: true, message: 'Avem nevoie de acordul tău pentru a publica recenzia.' },
        consentPrivacy: { type: 'bool', mustBeTrue: true, message: PRIVACY_MSG },
        ageConfirm: { type: 'bool', mustBeTrue: true, message: AGE_MSG },
      });
      if (!ok) fail(errors);
      const { consentPublish, consentPrivacy, ageConfirm, ...fields } = data;
      await update((db) => {
        db.reviews.push({ id: crypto.randomUUID(), ...fields, status: 'pending', verified: false, reply: '', createdAt: now() });
      });
      const inbox = companyInbox();
      if (inbox) {
        await sendMail({
          to: inbox,
          subject: `Recenzie nouă de moderat (${fields.rating}/5)`,
          text: `${fields.name}: ${fields.text}\n\nModerează în ${site.baseUrl}/admin`,
        }).catch((e) => console.error('[mail]', e.message));
      }
      return done(ctx, isForm, 'review', 'Mulțumim! Recenzia ta va fi publicată după verificarea anti-spam — indiferent de nota acordată.');
    },
  },
  {
    method: 'POST',
    path: /^\/api\/newsletter\/subscribe$/,
    async handler(ctx) {
      guard(ctx);
      const { data: input, isForm } = await readPayload(ctx.req);
      if (looksLikeBot(input)) return done(ctx, isForm, 'newsletter', 'Verifică-ți emailul.');
      const { data, errors, ok } = validate(input, {
        email: { type: 'email', required: true, max: 160 },
        consentNewsletter: { type: 'bool', mustBeTrue: true, message: 'Bifează acordul pentru a primi newsletterul.' },
        ageConfirm: { type: 'bool', mustBeTrue: true, message: AGE_MSG },
      });
      if (!ok) fail(errors);
      await subscribe(data.email, 'footer');
      // Același răspuns indiferent dacă adresa era deja abonată (nu dezvăluim cine e în listă).
      return done(ctx, isForm, 'newsletter', 'Ți-am trimis un email de confirmare. Abonarea devine activă doar după ce confirmi.');
    },
  },
  {
    method: 'POST',
    path: /^\/api\/newsletter\/confirm$/,
    async handler(ctx) {
      const { data, isForm } = await readPayload(ctx.req);
      const id = verifyToken('confirm', data.token);
      const sub = id && getDb().subscribers.find((s) => s.id === id);
      if (!sub) throw new HttpError(400, 'Linkul de confirmare nu este valid sau a expirat.');
      await update((db) => {
        const s = db.subscribers.find((x) => x.id === sub.id);
        if (!s) return;
        s.status = 'confirmed';
        s.confirmedAt = s.confirmedAt || now();
      });
      if (isForm) return void redirect(ctx.res, '/multumim?form=confirmed');
      return { ok: true, message: 'Abonarea este confirmată. Mulțumim!' };
    },
  },
  {
    // Acceptă și dezabonarea „one-click” (RFC 8058) trimisă direct de clienții de email.
    method: 'POST',
    path: /^\/api\/newsletter\/unsubscribe$/,
    async handler(ctx) {
      const { data, isForm } = await readPayload(ctx.req);
      const id = verifyToken('unsubscribe', data.token || ctx.url.searchParams.get('token'));
      if (!id) throw new HttpError(400, 'Linkul de dezabonare nu este valid.');
      await update((db) => {
        db.subscribers = db.subscribers.filter((s) => s.id !== id);
      });
      if (isForm && !data['List-Unsubscribe']) return void redirect(ctx.res, '/multumim?form=unsubscribed');
      return { ok: true, message: 'Te-ai dezabonat. Nu vei mai primi emailuri de marketing de la noi.' };
    },
  },
  {
    method: 'POST',
    path: /^\/api\/data-request$/,
    async handler(ctx) {
      guard(ctx);
      const { data: input, isForm } = await readPayload(ctx.req);
      if (looksLikeBot(input)) return done(ctx, isForm, 'erase', 'Verifică-ți emailul.');
      const { data, errors, ok } = validate(input, {
        email: { type: 'email', required: true, max: 160 },
        details: { multiline: true, max: 500 },
      });
      if (!ok) fail(errors);
      const req = await update((db) => {
        const r = { id: crypto.randomUUID(), email: data.email, details: data.details, status: 'awaiting-confirmation', createdAt: now() };
        db.deletionRequests.push(r);
        return r;
      });
      const link = `${site.baseUrl}/stergere-date/confirmare?token=${signToken('erase', req.id)}`;
      await sendMail({
        to: data.email,
        subject: `Confirmă ștergerea datelor tale de la ${site.brand}`,
        text: `Am primit o cerere de ștergere a datelor asociate acestei adrese de email.\n\nPentru a confirma, deschide linkul (valabil 48 de ore):\n${link}\n\nDacă nu ai făcut tu cererea, ignoră acest email — nu se va șterge nimic.\n\n${site.company.legalName} · ${site.company.privacyEmail}`,
      });
      return done(ctx, isForm, 'erase', 'Ți-am trimis un email cu linkul de confirmare a ștergerii (valabil 48 de ore).');
    },
  },
  {
    method: 'POST',
    path: /^\/api\/data-request\/confirm$/,
    async handler(ctx) {
      const { data, isForm } = await readPayload(ctx.req);
      const id = verifyToken('erase', data.token);
      const req = id && getDb().deletionRequests.find((r) => r.id === id);
      if (!req || req.status !== 'awaiting-confirmation') throw new HttpError(400, 'Linkul nu este valid sau cererea a fost deja procesată.');
      if (Date.now() - Date.parse(req.createdAt) > 48 * 3600 * 1000) throw new HttpError(400, 'Linkul a expirat. Te rugăm să trimiți o cerere nouă.');
      const counts = await eraseByEmail(req.email, 'utilizator');
      await update((db) => {
        db.deletionRequests = db.deletionRequests.filter((r) => r.id !== id);
      });
      if (isForm) return void redirect(ctx.res, '/multumim?form=erased');
      const total = counts.messages + counts.reviews + counts.subscribers;
      return { ok: true, message: total ? `Gata. Am șters definitiv ${total} înregistrări asociate adresei tale.` : 'Nu am găsit date asociate acestei adrese. Nu mai păstrăm nimic despre tine.' };
    },
  },
  {
    // Statistici anonime, doar cu acordul vizitatorului: fără cookie-uri, fără IP, doar contoare pe zi.
    method: 'POST',
    path: /^\/api\/stats\/pageview$/,
    async handler(ctx) {
      if (!statsLimiter(ctx.ip)) return { ok: true };
      const { data } = await readPayload(ctx.req, 1024);
      const allowed = ['/', '/confidentialitate', '/termeni', '/rambursare', '/cookies', '/accesibilitate', '/stergere-date'];
      const p = allowed.includes(data.path) ? data.path : null;
      if (!p) return { ok: true };
      const day = new Date().toISOString().slice(0, 10);
      await update((db) => {
        const s = (db.stats[day] ||= { views: 0, paths: {} });
        s.views += 1;
        s.paths[p] = (s.paths[p] || 0) + 1;
      });
      return { ok: true };
    },
  },
];

