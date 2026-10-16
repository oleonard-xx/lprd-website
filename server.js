// Serverul site-ului LPRD — Node.js, fără dependențe externe.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

try {
  process.loadEnvFile('.env');
} catch {
  /* .env este opțional */
}

const { site, missingConfig } = await import('./config/site.js');
const { ROOT, UPLOAD_DIR, getDb, update } = await import('./lib/store.js');
const { HttpError, sendJson, sendHtml, redirect, clientIp } = await import('./lib/http.js');
const security = await import('./lib/security.js');
const { renderPage, renderShowcase, renderProjects, projectsJson, renderReviews, reviewSummary, renderPackages } = await import('./lib/render.js');
const { publicRoutes } = await import('./routes/public.js');
const { adminRoutes, requireAdmin } = await import('./routes/admin.js');
const { seedIfEmpty, runRetention } = await import('./lib/maintenance.js');

const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.join(ROOT, 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

function serveFile(res, baseDir, relPath, req) {
  const filePath = path.resolve(baseDir, '.' + path.posix.normalize('/' + relPath));
  if (!filePath.startsWith(baseDir + path.sep)) return false; // protecție path traversal
  let stat;
  try {
    stat = fs.statSync(filePath);
  } catch {
    return false;
  }
  if (!stat.isFile()) return false;
  const type = MIME[path.extname(filePath).toLowerCase()];
  if (!type) return false;
  const headers = {
    'Content-Type': type,
    'Accept-Ranges': 'bytes',
    'Cache-Control': process.env.NODE_ENV === 'production' ? 'public, max-age=86400' : 'no-cache',
  };
  // Cereri parțiale (Range): necesare pentru redarea video, în special în Safari.
  const range = req?.headers.range?.match(/^bytes=(\d*)-(\d*)$/);
  if (range && (range[1] || range[2])) {
    let start = range[1] ? Number(range[1]) : stat.size - Number(range[2]);
    let end = range[1] && range[2] ? Number(range[2]) : stat.size - 1;
    start = Math.max(0, start);
    end = Math.min(end, stat.size - 1);
    if (start > end) {
      res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` });
      res.end();
      return true;
    }
    res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${stat.size}`, 'Content-Length': end - start + 1 });
    fs.createReadStream(filePath, { start, end }).pipe(res);
    return true;
  }
  res.writeHead(200, { ...headers, 'Content-Length': stat.size });
  fs.createReadStream(filePath).pipe(res);
  return true;
}

// ---------- Pagini ----------

const LEGAL_PAGES = {
  '/confidentialitate': { page: 'privacy', title: 'Politica de confidențialitate' },
  '/termeni': { page: 'terms', title: 'Termeni și condiții' },
  '/rambursare': { page: 'refund', title: 'Politica de rambursare și anulare' },
  '/cookies': { page: 'cookies', title: 'Politica de cookie-uri' },
  '/accesibilitate': { page: 'accessibility', title: 'Declarație de accesibilitate' },
  '/stergere-date': { page: 'data-request', title: 'Cerere de ștergere a datelor' },
};

const TOKEN_PAGES = {
  '/newsletter/confirmare': { page: 'token-action', title: 'Confirmare abonare', purpose: 'confirm', endpoint: '/api/newsletter/confirm', heading: 'Confirmă abonarea la newsletter', text: 'Apasă butonul de mai jos pentru a confirma că dorești să primești newsletterul LPRD. Te poți dezabona oricând, cu un clic, din orice email.', button: 'Confirm abonarea' },
  '/dezabonare': { page: 'token-action', title: 'Dezabonare', purpose: 'unsubscribe', endpoint: '/api/newsletter/unsubscribe', heading: 'Dezabonare de la newsletter', text: 'Apasă butonul de mai jos și nu vei mai primi niciun email de marketing de la noi. Adresa ta va fi ștearsă din lista de abonați.', button: 'Mă dezabonez' },
  '/stergere-date/confirmare': { page: 'token-action', title: 'Confirmare ștergere date', purpose: 'erase', endpoint: '/api/data-request/confirm', heading: 'Confirmă ștergerea datelor', text: 'Apasă butonul de mai jos pentru a șterge definitiv toate datele asociate adresei tale de email: mesaje trimise prin formular, recenzii și abonarea la newsletter. Acțiunea nu poate fi anulată.', button: 'Șterge definitiv datele mele' },
};

function homePage() {
  const db = getDb();
  const projects = db.projects.filter((p) => p.published).sort((a, b) => (b.order ?? 0) - (a.order ?? 0) || b.createdAt.localeCompare(a.createdAt));
  const reviews = db.reviews.filter((r) => r.status === 'approved').sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  const packages = renderPackages();
  return renderPage('home', {
    pathname: '/',
    vars: {
      showcaseHtml: renderShowcase(projects),
      projectsHtml: renderProjects(projects),
      projectsJson: projectsJson(projects),
      reviewsHtml: renderReviews(reviews),
      reviewSummary: reviewSummary(reviews),
      packagesHtml: packages.cards,
      extraCostsHtml: packages.extra,
      vatNote: packages.vat,
      locationsHtml: site.locations
        .map((l) => `<li><strong>${escape(l.label)}</strong><br>${placeholder(l.address)}<br><span class="muted">${placeholder(l.hours)}</span></li>`)
        .join(''),
    },
  });
}

const escape = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const placeholder = (s) => (/^\[.*\]$/.test(s) ? `<mark class="todo">${escape(s)}</mark>` : escape(s));

function handlePage(req, res, url) {
  const p = url.pathname.replace(/\/+$/, '') || '/';

  if (p === '/') return sendHtml(res, 200, homePage());

  if (LEGAL_PAGES[p]) {
    const { page, title } = LEGAL_PAGES[p];
    return sendHtml(res, 200, renderPage(page, { pathname: p, title }));
  }
  if (TOKEN_PAGES[p]) {
    const cfg = TOKEN_PAGES[p];
    const token = url.searchParams.get('token') || '';
    const valid = Boolean(security.verifyToken(cfg.purpose, token));
    return sendHtml(res, 200, renderPage(cfg.page, { pathname: p, title: cfg.title, noindex: true, vars: { ...cfg, token, invalid: valid ? '' : 'invalid' } }));
  }
  if (p === '/multumim') {
    const kind = url.searchParams.get('form');
    const messages = {
      contact: 'Mesajul tău a ajuns la noi. Îți răspundem prin email sau telefon, în zilele lucrătoare.',
      review: 'Mulțumim! Recenzia ta va apărea pe site după o verificare de spam și limbaj — indiferent de nota acordată.',
      newsletter: 'Aproape gata: ți-am trimis un email de confirmare. Abonarea devine activă doar după ce confirmi.',
      erase: 'Ți-am trimis un email cu linkul de confirmare a ștergerii (valabil 48 de ore).',
      confirmed: 'Abonarea la newsletter este confirmată. Te poți dezabona oricând, cu un clic, din orice email.',
      unsubscribed: 'Te-ai dezabonat, iar adresa ta a fost ștearsă din lista de abonați.',
      erased: 'Datele asociate adresei tale au fost șterse definitiv.',
    };
    return sendHtml(res, 200, renderPage('status', { pathname: p, title: 'Mulțumim', noindex: true, vars: { heading: 'Mulțumim!', message: messages[kind] || 'Cererea a fost înregistrată.' } }));
  }
  if (p === '/admin') {
    return serveFile(res, PUBLIC_DIR, 'admin.html') || notFound(res);
  }
  if (p === '/robots.txt') {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end(`User-agent: *\nDisallow: /admin\nDisallow: /api/\nSitemap: ${site.baseUrl}/sitemap.xml\n`);
  }
  if (p === '/sitemap.xml') {
    const urls = ['/', ...Object.keys(LEGAL_PAGES)].map((u) => `<url><loc>${site.baseUrl}${u}</loc></url>`).join('');
    res.writeHead(200, { 'Content-Type': 'application/xml; charset=utf-8' });
    return res.end(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`);
  }
  return notFound(res);
}

function notFound(res) {
  sendHtml(res, 404, renderPage('status', { pathname: '/404', title: 'Pagina nu a fost găsită', noindex: true, vars: { kind: 'error', heading: 'Pagina nu există', message: 'Linkul poate fi greșit sau pagina a fost mutată.' } }));
}

// ---------- API ----------

const routes = [...publicRoutes, ...adminRoutes];

async function handleApi(req, res, url) {
  const isMutation = req.method !== 'GET' && req.method !== 'HEAD';
  if (isMutation && !security.isSameOrigin(req)) throw new HttpError(403, 'Origine nepermisă.');

  for (const route of routes) {
    if (route.method !== req.method) continue;
    const m = url.pathname.match(route.path);
    if (!m) continue;
    const ctx = { req, res, url, params: m.groups || {}, ip: clientIp(req) };
    if (route.admin) requireAdmin(ctx);
    const result = await route.handler(ctx);
    if (result === undefined) return; // handlerul a răspuns singur
    return sendJson(res, result.status || 200, result.body ?? result);
  }
  throw new HttpError(404, 'Ruta nu există.');
}

// ---------- Server ----------

const server = http.createServer(async (req, res) => {
  security.securityHeaders(res);
  let url;
  try {
    url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  } catch {
    res.writeHead(400).end();
    return;
  }
  try {
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
    if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'Metodă nepermisă.');
    if (url.pathname.startsWith('/uploads/')) {
      if (serveFile(res, UPLOAD_DIR, url.pathname.slice('/uploads/'.length))) return;
      return notFound(res);
    }
    if (/^\/(css|js|img|media)\//.test(url.pathname) || url.pathname === '/favicon.ico') {
      if (serveFile(res, PUBLIC_DIR, url.pathname === '/favicon.ico' ? 'img/favicon.svg' : url.pathname, req)) return;
      return notFound(res);
    }
    return handlePage(req, res, url);
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500;
    if (status === 500) console.error(err);
    if (res.headersSent) return res.end();
    const isForm = (req.headers['content-type'] || '').startsWith('application/x-www-form-urlencoded');
    if (url.pathname.startsWith('/api/') && !isForm) {
      return sendJson(res, status, { error: status === 500 ? 'A apărut o eroare neașteptată. Încearcă din nou.' : err.message, fields: err.details });
    }
    // Formulare trimise fără JavaScript: afișăm erorile într-o pagină simplă.
    const fieldErrors = err.details ? Object.values(err.details) : [];
    const message = status === 500 ? 'A apărut o eroare neașteptată. Încearcă din nou.' : [err.message, ...fieldErrors].join(' ');
    sendHtml(res, status, renderPage('status', { pathname: '/eroare', title: 'Eroare', noindex: true, vars: { kind: 'error', heading: 'Ceva nu a mers', message } }));
  }
});

await seedIfEmpty();
await runRetention();
setInterval(runRetention, 12 * 60 * 60 * 1000).unref();

const generated = security.ensureAdminPassword();

server.listen(PORT, () => {
  console.log(`\n  ${site.brand} rulează pe ${site.baseUrl}`);
  console.log(`  Administrare: ${site.baseUrl}/admin`);
  if (generated) console.log(`\n  Parolă de administrator generată (afișată o singură dată): ${generated}\n  O poți schimba cu: npm run set-password`);
  const missing = missingConfig();
  if (missing.length) console.warn(`\n  ⚠ Date de completat în config/site.js înainte de lansare:\n    - ${missing.join('\n    - ')}\n`);
});
