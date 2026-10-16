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
    description: description || 'LPRD proiectează și dezvoltă site-uri de prezentare, magazine online și aplicații web, cu o echipă de programatori licențiați în informatică.',
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

function projectMedia(p, eager = false) {
  if (p.image) {
    return `<img src="${escapeHtml(p.image)}" alt="${escapeHtml(p.imageAlt)}" loading="${eager ? 'eager' : 'lazy'}" decoding="async" width="1200" height="750">`;
  }
  return siteMock(p);
}

// Slider-ul de proiecte de sub hero.
export function renderShowcase(projects) {
  if (!projects.length) return '';
  return projects
    .slice(0, 6)
    .map(
      (p, i) => `<li class="slide" data-carousel-item>
  <div class="slide-media">${projectMedia(p, i === 0)}</div>
  <div class="slide-caption">
    <p class="slide-cat">${escapeHtml(CATEGORIES[p.category] || p.category)}${p.demo ? ' · Proiect demonstrativ' : ''}</p>
    <p class="slide-title">${escapeHtml(p.title)}</p>
    <button type="button" class="slide-link" data-project="${escapeHtml(p.id)}" aria-haspopup="dialog">Vezi detalii<span class="visually-hidden">: ${escapeHtml(p.title)}</span></button>
  </div>
</li>`
    )
    .join('\n');
}

export function renderProjects(projects) {
  if (!projects.length) {
    return `<p class="empty-state">Portofoliul este în curs de actualizare. Între timp, <a href="/#contact">scrie-ne</a> și îți trimitem exemple relevante pentru domeniul tău.</p>`;
  }
  const cards = projects
    .map((p) => {
      const tags = p.tags?.length ? `<ul class="tags" aria-label="Tehnologii">${listItems(p.tags)}</ul>` : '';
      const badge = p.demo ? '<span class="badge badge-muted">Proiect demonstrativ</span>' : '';
      return `<li class="project-card reveal" data-category="${escapeHtml(p.category)}">
  <article class="project">
    <div class="project-media">${projectMedia(p)}</div>
    <div class="project-body">
      <p class="project-meta">${escapeHtml(CATEGORIES[p.category] || p.category)}${p.year ? ` · ${escapeHtml(p.year)}` : ''} ${badge}</p>
      <h3 class="project-title"><button type="button" class="stretched" data-project="${escapeHtml(p.id)}" aria-haspopup="dialog">${escapeHtml(p.title)}</button></h3>
      <p>${escapeHtml(p.summary)}</p>
      ${tags}
    </div>
  </article>
</li>`;
    })
    .join('\n');
  return `<ul class="project-grid" role="list">${cards}</ul>`;
}

export function projectsJson(projects) {
  const pick = projects.map(({ id, title, category, year, summary, description, tags, url, image, imageAlt, client, demo }) => ({
    id, title, category: CATEGORIES[category] || category, year, summary, description, tags, url, image, imageAlt, client, demo,
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
