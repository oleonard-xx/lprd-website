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
      title: 'Service auto — prezentare și programări',
      category: 'prezentare',
      summary: 'Site de prezentare pentru un service auto: servicii, galerie, ITP și contact.',
      description: 'Proiect demonstrativ pentru un service auto: structură clară a serviciilor, pagini dedicate pentru mecanică, vopsitorie și ITP, galerie și formular de contact.',
      tags: ['HTML/CSS', 'JavaScript', 'Local SEO'],
      url: 'https://clever-motors-prototip.vercel.app',
      image: '/img/demos/clever-motors-prototip.png',
      imageAlt: 'Previzualizare a paginii principale a șablonului demo',
    },
    {
      title: 'Magazin de piese auto',
      category: 'ecommerce',
      summary: 'Magazin online de piese auto cu catalog pe categorii, căutare după vehicul, coș și cont.',
      description: 'Proiect demonstrativ pentru un magazin de piese auto: catalog pe categorii și vehicule, pagini de produs, coș, ofertele zilei și cont de client.',
      tags: ['E-commerce', 'Catalog', 'UX'],
      url: 'https://elit-constanta.vercel.app',
      image: '/img/demos/elit-constanta.png',
      imageAlt: 'Previzualizare a paginii principale a șablonului demo',
    },
    {
      title: 'Parbrize și folii auto',
      category: 'prezentare',
      summary: 'Site pentru un atelier de parbrize, folii și polish faruri, cu servicii și cerere de ofertă.',
      description: 'Proiect demonstrativ pentru un atelier de geamuri auto: servicii explicate simplu, formular de ofertă și informații de contact vizibile.',
      tags: ['HTML/CSS', 'Tailwind', 'Accesibilitate'],
      url: 'https://expert-new-glass-deploy-v2.vercel.app',
      image: '/img/demos/expert-new-glass-deploy-v2.png',
      imageAlt: 'Previzualizare a paginii principale a șablonului demo',
    },
    {
      title: 'Service auto complet',
      category: 'prezentare',
      summary: 'Site pentru un service auto complet, cu servicii, echipă și formular de contact.',
      description: 'Proiect demonstrativ pentru un service auto: prezentarea serviciilor, pagină de recrutare și contact rapid.',
      tags: ['HTML/CSS', 'JavaScript'],
      url: 'https://fixmycar-site.vercel.app',
      image: '/img/demos/fixmycar-site.png',
      imageAlt: 'Previzualizare a paginii principale a șablonului demo',
    },
    {
      title: 'Folii auto pentru geamuri și faruri',
      category: 'prezentare',
      summary: 'Prototip de site pentru folii de geamuri, faruri și stopuri.',
      description: 'Proiect demonstrativ pentru un atelier de folii auto: servicii, galerie și apel la acțiune clar pentru programare.',
      tags: ['HTML/CSS', 'JavaScript'],
      url: 'https://folii-auto-constanta-prototip.vercel.app',
      image: '/img/demos/folii-auto-constanta-prototip.png',
      imageAlt: 'Previzualizare a paginii principale a șablonului demo',
    },
    {
      title: 'Tinichigerie și vopsitorie auto',
      category: 'prezentare',
      summary: 'Site pentru un atelier de tinichigerie și vopsitorie cu servicii, procese și contact.',
      description: 'Proiect demonstrativ pentru tinichigerie și vopsitorie: prezentarea procesului, a serviciilor și a datelor de contact.',
      tags: ['HTML/CSS', 'JavaScript'],
      url: 'https://mati-car-service-mvp.vercel.app',
      image: '/img/demos/mati-car-service-mvp.png',
      imageAlt: 'Previzualizare a paginii principale a șablonului demo',
    },
    {
      title: 'Service multimarcă cu programări online',
      category: 'aplicatie',
      summary: 'Site cu programări online și panou de administrare pentru un service multimarcă.',
      description: 'Proiect demonstrativ cu formular de programare, confirmare prin calendar și panou de administrare pentru service.',
      tags: ['Programări', 'Panou admin', 'JavaScript'],
      url: 'https://quickserviceauto.vercel.app',
      image: '/img/demos/quickserviceauto.png',
      imageAlt: 'Previzualizare a paginii principale a șablonului demo',
    },
    {
      title: 'Cafenea de specialitate',
      category: 'prezentare',
      summary: 'Site editorial pentru o cafenea: meniu, galerie, program și contact.',
      description: 'Proiect demonstrativ pentru o cafenea de specialitate: design editorial, galerie interactivă, pagini legale și date structurate pentru Google.',
      tags: ['HTML/CSS', 'JavaScript', 'SEO'],
      url: 'https://sigma-cafe.vercel.app',
      image: '/img/demos/sigma-cafe.png',
      imageAlt: 'Previzualizare a paginii principale a șablonului demo',
    },
    {
      title: 'Restaurant cu meniu și rezervări',
      category: 'aplicatie',
      summary: 'Site de restaurant cu meniu administrabil, oferte, rezervări și panou admin.',
      description: 'Proiect demonstrativ pentru un restaurant: meniu și oferte editabile dintr-un panou de administrare, rezervări și scenă 3D.',
      tags: ['Panou admin', 'Three.js', 'UX'],
      url: 'https://sofra-restaurant-demo.vercel.app',
      image: '/img/demos/sofra-restaurant-demo.png',
      imageAlt: 'Previzualizare a paginii principale a șablonului demo',
    },
  ];
  await update((db) => {
    db.projects = demo.map((p, i) => ({
      id: crypto.randomUUID(),
      ...p,
      year: '',
      url: p.url || '',
      client: '',
      image: p.image || '',
      imageAlt: p.imageAlt || '',
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

