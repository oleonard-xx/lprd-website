// Date inițiale, retenția datelor și ștergerea la cerere.
import crypto from 'node:crypto';
import { site } from '../config/site.js';
import { getDb, update } from './store.js';
import { hashEmail } from './security.js';

// Proiecte demonstrative, marcate vizibil ca atare pe site. Înlocuiți-le din /admin cu lucrări reale.
export async function seedIfEmpty() {
  if (getDb().meta.seeded) return;
  const at = new Date().toISOString();
  const demo = [
    {
      title: 'Clinică stomatologică — site de prezentare',
      category: 'prezentare',
      summary: 'Exemplu de structură pentru o clinică: servicii, medici, programări online și pagini legale complete.',
      description: 'Proiect demonstrativ care arată cum abordăm un site de prezentare pentru domeniul medical: arhitectura informației gândită pentru pacienți, formular de programare cu consimțăminte separate, pagini rapide și accesibile.',
      tags: ['HTML/CSS', 'JavaScript', 'Accesibilitate'],
    },
    {
      title: 'Magazin de cafea de specialitate',
      category: 'ecommerce',
      summary: 'Exemplu de magazin online cu abonamente, filtre după origine și un checkout în trei pași.',
      description: 'Proiect demonstrativ pentru un magazin online: catalog cu filtre, coș persistent, prețuri afișate cu toate taxele încă din pagina produsului și flux de retur explicat clar.',
      tags: ['E-commerce', 'Plăți online', 'UX'],
    },
    {
      title: 'Portal de rezervări pentru săli de sport',
      category: 'aplicatie',
      summary: 'Exemplu de aplicație web cu calendar, abonamente și panou pentru antrenori.',
      description: 'Proiect demonstrativ pentru o aplicație web: autentificare cu roluri, calendar de rezervări în timp real, notificări prin email cu dezabonare dintr-un clic și export de date pentru utilizatori.',
      tags: ['Aplicație web', 'API', 'Node.js'],
    },
  ];
  await update((db) => {
    db.projects = demo.map((p, i) => ({
      id: crypto.randomUUID(),
      ...p,
      year: '',
      url: '',
      client: '',
      image: '',
      imageAlt: '',
      demo: true,
      published: true,
      order: demo.length - i,
      createdAt: at,
      updatedAt: at,
    }));
    db.meta.seeded = true;
  });
}

const monthsAgo = (m) => {
  const d = new Date();
  d.setMonth(d.getMonth() - m);
  return d.toISOString();
};
const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString();

// Șterge automat datele păstrate mai mult decât spune politica de confidențialitate.
export async function runRetention() {
  const r = site.legal.retention;
  const msgCutoff = monthsAgo(r.messagesMonths);
  const pendingCutoff = daysAgo(r.pendingDays);
  const rejectedCutoff = daysAgo(r.reviewsRejectedDays);
  const statsCutoff = monthsAgo(r.statsMonths).slice(0, 10);
  const db = getDb();
  const before = JSON.stringify([db.messages.length, db.subscribers.length, db.reviews.length, db.deletionRequests.length, Object.keys(db.stats).length]);
  await update((d) => {
    d.messages = d.messages.filter((m) => m.createdAt > msgCutoff);
    d.subscribers = d.subscribers.filter((s) => s.status === 'confirmed' || s.createdAt > pendingCutoff);
    d.reviews = d.reviews.filter((rv) => rv.status !== 'rejected' || (rv.moderatedAt || rv.createdAt) > rejectedCutoff);
    d.deletionRequests = d.deletionRequests.filter((q) => q.createdAt > pendingCutoff);
    for (const day of Object.keys(d.stats)) if (day < statsCutoff) delete d.stats[day];
  });
  const after = JSON.stringify([db.messages.length, db.subscribers.length, db.reviews.length, db.deletionRequests.length, Object.keys(db.stats).length]);
  if (before !== after) console.log('[retenție] Au fost șterse date mai vechi decât perioada de păstrare.');
}

// Șterge tot ce este asociat unei adrese de email. Păstrăm doar o amprentă (HMAC) și data,
// ca dovadă că cererea a fost onorată (art. 5 alin. 2 GDPR — responsabilitate).
export async function eraseByEmail(email, by) {
  const e = email.trim().toLowerCase();
  return update((db) => {
    const counts = {
      messages: db.messages.filter((m) => m.email === e).length,
      reviews: db.reviews.filter((r) => r.email === e).length,
      subscribers: db.subscribers.filter((s) => s.email === e).length,
    };
    db.messages = db.messages.filter((m) => m.email !== e);
    db.reviews = db.reviews.filter((r) => r.email !== e);
    db.subscribers = db.subscribers.filter((s) => s.email !== e);
    db.deletionLog.push({ emailHash: hashEmail(e), at: new Date().toISOString(), by, counts });
    return counts;
  });
}

