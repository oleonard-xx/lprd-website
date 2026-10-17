// Șabloane HTML minimale.
//   {{cale}}    → text escapat; valorile [de completat] din config apar marcate vizibil
//   {{=cale}}   → text escapat, fără marcaj (pentru atribute)
//   {{{cale}}}  → HTML brut (doar pentru fragmente generate de server)
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './store.js';
import { site } from '../config/site.js';

const VIEWS = path.join(ROOT, 'views');
const isDev = process.env.NODE_ENV !== 'production';
const cache = new Map();
const fullImageCache = new Map();

export const escapeHtml = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const isPlaceholder = (v) => typeof v === 'string' && /^\[.*\]$/.test(v);

function load(name) {
  if (!isDev && cache.has(name)) return cache.get(name);
  const tpl = fs.readFileSync(path.join(VIEWS, `${name}.html`), 'utf8');
  cache.set(name, tpl);
  return tpl;
}

const lookup = (vars, key) => key.split('.').reduce((o, k) => (o == null ? undefined : o[k]), vars);

export function fill(tpl, vars) {
  return tpl.replace(/\{\{\{\s*([\w.]+)\s*\}\}\}|\{\{(=?)\s*([\w.]+)\s*\}\}/g, (_, raw, plain, key) => {
    if (raw) return String(lookup(vars, raw) ?? '');
    const value = lookup(vars, key);
    if (!plain && isPlaceholder(value)) {
      return `<mark class="todo" title="De completat în config/site.js">${escapeHtml(value)}</mark>`;
    }
    return escapeHtml(value);
  });
}

function listItems(items) {
  return items.map((i) => `<li>${escapeHtml(i)}</li>`).join('');
}

export function sharedVars() {
  return {
    site,
    company: site.company,
    legal: site.legal,
    year: new Date().getFullYear(),
    commitmentsList: listItems(site.commitments),
  };
}

export function renderPage(page, { pathname = '/', title, description, vars = {}, noindex = false }) {
  const base = { ...sharedVars(), ...vars };
  const content = fill(load(`pages/${page}`), base);
  return fill(load('layout'), {
    ...base,
    page,
    title: title ? `${title} · ${site.brand}` : `${site.brand} — ${site.tagline}`,
    description: description || 'SeeCode proiectează și dezvoltă site-uri de prezentare, magazine online și aplicații web, cu o echipă de programatori licențiați în informatică.',
    themeColor: site.themeColor,
    canonical: `${site.baseUrl}${pathname}`,
    robots: noindex ? '<meta name="robots" content="noindex">' : '',
    header: fill(load('partials/header'), base),
    footer: fill(load('partials/footer'), base),
    cookieBanner: fill(load('partials/cookie-banner'), base),
    content,
    jsonLd: jsonLd(),
  });
}

function jsonLd() {
  const c = site.company;
  const org = { '@context': 'https://schema.org', '@type': 'Organization', name: site.brand, url: site.baseUrl };
  if (!isPlaceholder(c.legalName)) org.legalName = c.legalName;
  if (!isPlaceholder(c.email)) org.email = c.email;
  if (!isPlaceholder(c.phone)) org.telephone = c.phone;
  return JSON.stringify(org).replace(/</g, '\\u003c');
}

// ---------- Fragmente generate de server ----------

export const CATEGORIES = {
  prezentare: 'Site de prezentare',
  ecommerce: 'Magazin online',
  aplicatie: 'Aplicație web',
  design: 'UI/UX & branding',
};

const hashNum = (s) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

// Machetă de site generată (ilustrație originală, fără probleme de licență) pentru proiectele fără imagine.
function siteMock(p) {
  const n = hashNum(p.id) % 4;
  return `<div class="site-mock mock-${n}" aria-hidden="true">
  <span class="sm-bar"><i></i><i></i><i></i></span>
  <span class="sm-body">
    <span class="sm-nav"><b></b><i></i><i></i><i></i></span>
    <span class="sm-hero"><span class="sm-copy"><i></i><i></i><i class="sm-cta"></i></span><span class="sm-art"></span></span>
    <span class="sm-cards"><i></i><i></i><i></i></span>
  </span>
</div>`;
}

// /img/demos/NUME.png → /img/demos/NUME-full.webp, doar dacă fișierul există (rezultat ținut în cache).
function fullProjectImage(image) {
  const match = typeof image === 'string' && image.match(/^\/img\/demos\/([^/]+)\.png$/);
  if (!match) return null;
  if (!fullImageCache.has(image)) {
    const file = path.join(ROOT, 'public', 'img', 'demos', match[1] + '-full.webp');
    fullImageCache.set(image, fs.existsSync(file) ? '/img/demos/' + match[1] + '-full.webp' : null);
  }
  return fullImageCache.get(image);
}

function projectMedia(p, eager = false) {
  if (p.image) {
    // Captura pe toată lungimea paginii (dacă există) derulează la hover; altfel, primul ecran.
    const full = p.imageFull || fullProjectImage(p.image);
    const attrs = full ? 'class="frame-shot" width="1200" height="3000"' : 'width="1200" height="750"';
    return `<img ${attrs} src="${escapeHtml(full || p.image)}" alt="${escapeHtml(p.imageAlt)}" loading="${eager ? 'eager' : 'lazy'}" decoding="async">`;
  }
  return siteMock(p);
}

// Ramă de browser în jurul capturii: bara cu adresa site-ului dă context și uniformizează preview-urile.
function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}

function browserFrame(p, eager = false) {
  const host = hostOf(p.url);
  return `<div class="frame">
  <span class="frame-bar" aria-hidden="true"><i></i><i></i><i></i>${host ? `<span class="frame-url">${escapeHtml(host)}</span>` : ''}</span>
  <div class="frame-view">${projectMedia(p, eager)}</div>
</div>`;
}

// Slider-ul de proiecte de sub hero.
export function renderShowcase(projects) {
  if (!projects.length) return '';
  return shuffle(projects)
    .slice(0, 6)
    .map(
      (p, i) => `<li class="slide" data-carousel-item>
  ${browserFrame(p, i === 0)}
  <div class="slide-caption">
    <span class="slide-num" aria-hidden="true">${String(i + 1).padStart(2, '0')}</span>
    <div class="slide-text">
      <p class="slide-cat">${escapeHtml(CATEGORIES[p.category] || p.category)}${p.demo ? ' · Șablon demo' : ''}</p>
      <p class="slide-title">${escapeHtml(p.title)}</p>
    </div>
    <button type="button" class="slide-link" data-project="${escapeHtml(p.id)}" aria-haspopup="dialog">Vezi detalii<span class="visually-hidden">: ${escapeHtml(p.title)}</span><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 12h14m-6-6 6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
  </div>
</li>`
    )
    .join('\n');
}

// Amestecă (Fisher-Yates) o copie a listei.
export function shuffle(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Sortate pe categorii (ordinea din CATEGORIES), amestecate în cadrul fiecărei categorii.
export function groupShuffled(projects) {
  return Object.keys(CATEGORIES)
    .map((cat) => ({ cat, items: shuffle(projects.filter((p) => p.category === cat)) }))
    .filter((g) => g.items.length);
}

function projectCard(p) {
  const badge = p.demo ? '<span class="project-badge">Demo</span>' : '';
  return `<li class="project-card reveal" data-category="${escapeHtml(p.category)}">
  <article class="project">
    <div class="project-media">${browserFrame(p)}${badge}</div>
    <div class="project-body">
      <div class="project-text">
      <p class="project-meta">${escapeHtml(CATEGORIES[p.category] || p.category)}${p.year ? ` · ${escapeHtml(p.year)}` : ''}</p>
      <h3 class="project-title"><button type="button" class="stretched" data-project="${escapeHtml(p.id)}" aria-haspopup="dialog">${escapeHtml(p.title)}</button></h3>
      <p class="project-summary">${escapeHtml(p.summary)}</p>
      </div>
      <span class="project-arrow" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M7 17 17 7M9 7h8v8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
    </div>
  </article>
</li>`;
}

// O singură grilă, ordonată pe categorii; filtrele de deasupra fac separarea, fără subtitluri care lasă carduri orfane.
export function renderProjects(projects) {
  if (!projects.length) {
    return `<p class="empty-state">Portofoliul este în curs de actualizare. Între timp, <a href="/#contact">scrie-ne</a> și îți trimitem exemple relevante pentru domeniul tău.</p>`;
  }
  const items = groupShuffled(projects).flatMap((g) => g.items);
  return `<ul class="project-grid" role="list">${items.map(projectCard).join('\n')}</ul>`;
}

export function projectsJson(projects) {
  const pick = projects.map(({ id, title, category, year, summary, description, tags, url, image, imageAlt, client, demo }) => ({
    id, title, category: CATEGORIES[category] || category, year, summary, description, tags, url, image, imageAlt, imageFull: fullProjectImage(image), client, demo,
  }));
  return JSON.stringify(pick).replace(/</g, '\\u003c');
}

const initials = (name) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');

const fmtDate = (iso) => new Date(iso).toLocaleDateString('ro-RO', { year: 'numeric', month: 'long' });

export function renderReviews(reviews) {
  if (!reviews.length) {
    return `<div class="empty-state reviews-empty">
  <p><strong>Încă nu avem recenzii publicate pe site.</strong></p>
  <p>Preferăm o pagină goală uneia cu recenzii inventate. Ai lucrat cu noi? Spune-le și altora cum a fost.</p>
</div>`;
  }
  const items = reviews
    .map((r) => {
      const who = [r.role, r.company].filter(Boolean).map(escapeHtml).join(', ');
      const verified = r.verified
        ? '<span class="badge badge-ok" title="Am confirmat că persoana a fost clientul nostru">Client verificat</span>'
        : '';
      const reply = r.reply ? `<div class="review-reply"><strong>Răspunsul ${site.brand}:</strong> ${escapeHtml(r.reply)}</div>` : '';
      return `<li class="review-card reveal">
  <figure class="card review">
    <div class="stars" role="img" aria-label="Notă: ${r.rating} din 5">${'<span class="star on">★</span>'.repeat(r.rating)}${'<span class="star">★</span>'.repeat(5 - r.rating)}</div>
    <blockquote><p>${escapeHtml(r.text)}</p></blockquote>
    <figcaption>
      <span class="avatar" aria-hidden="true">${escapeHtml(initials(r.name))}</span>
      <span class="who"><strong>${escapeHtml(r.name)}</strong>${who ? `<span>${who}</span>` : ''}</span>
      ${verified}
    </figcaption>
    <p class="review-date">Publicată: <time datetime="${escapeHtml(r.publishedAt)}">${fmtDate(r.publishedAt)}</time></p>
    ${reply}
  </figure>
</li>`;
    })
    .join('\n');
  return `<ul class="review-grid" role="list">${items}</ul>`;
}

export function reviewSummary(reviews) {
  if (reviews.length < 3) return '';
  const avg = reviews.reduce((s, r) => s + r.rating, 0) / reviews.length;
  return `<p class="review-summary"><strong>${avg.toFixed(1).replace('.', ',')} din 5</strong> — media tuturor celor ${reviews.length} recenzii publicate, inclusiv a celor negative.</p>`;
}

export function renderPackages() {
  const vat = site.company.vatPayer === true ? 'Prețurile includ TVA.' : site.company.vatPayer === false ? 'Firma nu este plătitoare de TVA; prețul afișat este prețul final.' : '';
  const cards = site.packages
    .map(
      (p) => `<li class="card package reveal${p.featured ? ' featured' : ''}">
  <h3>${escapeHtml(p.name)}</h3>
  <p class="price">${p.price ? escapeHtml(p.price) : 'Preț fix, stabilit în ofertă'}</p>
  <p>${escapeHtml(p.description)}</p>
  <ul class="check-list">${listItems(p.includes)}</ul>
  <a class="btn btn-outline jelly-hover" href="/#contact">Cere ofertă</a>
</li>`
    )
    .join('\n');
  return { cards, extra: listItems(site.extraCosts), vat };
}
