// Panoul de administrare. Tot conținutul venit de la utilizatori este inserat ca text (fără innerHTML).

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  el.append(...children.flat().filter((c) => c != null && c !== false));
  return el;
}

const fmt = (iso) => (iso ? new Date(iso).toLocaleString('ro-RO', { dateStyle: 'medium', timeStyle: 'short' }) : '—');

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`/api/admin/${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'seecode-admin' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== 'login') {
    showLogin();
    throw new Error(data.error || 'Neautentificat');
  }
  if (!res.ok) {
    const err = new Error(data.error || 'Eroare');
    err.fields = data.fields;
    throw err;
  }
  return data;
}

const confirmAction = (msg) => window.confirm(msg);

// ---------- Autentificare ----------
function showLogin() {
  $('#app-view').hidden = true;
  $('#login-view').hidden = false;
  $('#password').focus();
}

async function showApp() {
  $('#login-view').hidden = true;
  $('#app-view').hidden = false;
  await loadOverview();
  switchTab('overview');
}

$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('#login-error').textContent = '';
  try {
    await api('login', { method: 'POST', body: { password: $('#password').value } });
    $('#password').value = '';
    showApp();
  } catch (err) {
    $('#login-error').textContent = err.message;
  }
});

$('#logout').addEventListener('click', async () => {
  await api('logout', { method: 'POST' }).catch(() => {});
  showLogin();
});

// ---------- Navigare ----------
const loaders = {
  overview: loadOverview,
  projects: loadProjects,
  reviews: loadReviews,
  messages: loadMessages,
  newsletter: loadSubscribers,
  gdpr: loadGdpr,
};

function switchTab(name) {
  $$('#tabs [data-tab]').forEach((b) => (b.dataset.tab === name ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current')));
  $$('[data-view]').forEach((v) => (v.hidden = v.dataset.view !== name));
  loaders[name]?.().catch((err) => alert(err.message));
  $('#admin-main').focus();
}
$('#tabs').addEventListener('click', (e) => {
  const b = e.target.closest('[data-tab]');
  if (b) switchTab(b.dataset.tab);
});

// ---------- Panou ----------
let categories = {};

async function loadOverview() {
  const data = await api('overview');
  categories = data.categories;
  const labels = {
    projects: 'Proiecte',
    reviewsPending: 'Recenzii de moderat',
    messagesNew: 'Mesaje noi',
    subscribers: 'Abonați confirmați',
    deletionRequests: 'Cereri de ștergere în curs',
  };
  $('#stats').replaceChildren(...Object.entries(labels).map(([k, label]) => h('div', { class: 'stat' }, h('b', {}, String(data.counts[k])), h('span', {}, label))));
  for (const el of $$('[data-count]')) el.textContent = data.counts[el.dataset.count] || '';

  $('#config-warning').hidden = !data.missingConfig.length;
  $('#config-missing').replaceChildren(...data.missingConfig.map((m) => h('li', {}, h('code', {}, m))));

  const chart = $('#chart');
  const max = Math.max(1, ...data.stats.map((s) => s.views));
  if (!data.stats.length) chart.replaceChildren(h('p', { class: 'empty' }, 'Încă nu există date.'));
  else {
    chart.replaceChildren(
      ...data.stats.map((s, i) => {
        const bar = h('span', { class: 'bar', title: `${s.day}: ${s.views} vizite` });
        bar.style.height = `${(s.views / max) * 100}%`;
        bar.style.animationDelay = `${i * 25}ms`;
        return bar;
      })
    );
    chart.setAttribute('aria-label', `Vizite pe zi: ${data.stats.map((s) => `${s.day} ${s.views}`).join(', ')}`);
  }
}

// ---------- Proiecte ----------
let projects = [];

async function loadProjects() {
  if (!Object.keys(categories).length) await loadOverview();
  projects = (await api('projects')).items;
  const list = $('#projects-list');
  if (!projects.length) return list.replaceChildren(h('p', { class: 'empty' }, 'Niciun proiect. Adaugă primul proiect.'));
  list.replaceChildren(
    ...[...projects]
      .sort((a, b) => (b.order ?? 0) - (a.order ?? 0))
      .map((p) =>
        h(
          'article',
          { class: 'item project-row' },
          p.image ? h('img', { class: 'thumb', src: p.image, alt: p.imageAlt }) : h('div', { class: 'thumb' }),
          h(
            'div',
            {},
            h('div', { class: 'item-head' }, h('h3', {}, p.title), h('span', {}, p.published ? h('span', { class: 'pill ok' }, 'Publicat') : h('span', { class: 'pill' }, 'Ciornă'), ' ', p.demo ? h('span', { class: 'pill warn' }, 'Demonstrativ') : null)),
            h('p', { class: 'meta' }, `${categories[p.category] || p.category}${p.year ? ` · ${p.year}` : ''} · ordine ${p.order ?? 0}`),
            h('p', {}, p.summary),
            h(
              'div',
              { class: 'actions' },
              h('button', { class: 'btn btn-sm', type: 'button', onclick: () => editProject(p) }, 'Editează'),
              h('button', {
                class: 'btn btn-sm btn-danger', type: 'button',
                onclick: async () => {
                  if (!confirmAction(`Ștergi proiectul „${p.title}”?`)) return;
                  await api(`projects/${p.id}`, { method: 'DELETE' });
                  loadProjects();
                },
              }, 'Șterge')
            )
          )
        )
      )
  );
}

const editor = $('#project-editor');
const pform = $('#project-form');
let editingId = null;

function setPreview(url, alt) {
  $('#pf-image').value = url || '';
  $('#pf-preview').replaceChildren(url ? h('img', { src: url, alt: alt || 'Previzualizare' }) : h('p', { class: 'muted' }, 'Fără imagine — pe site se afișează o copertă generată.'));
  $('#pf-remove-image').hidden = !url;
}

function editProject(p) {
  editingId = p?.id || null;
  $('#pe-title').textContent = p ? 'Editează proiectul' : 'Proiect nou';
  const sel = $('#pf-category');
  sel.replaceChildren(...Object.entries(categories).map(([v, l]) => h('option', { value: v }, l)));
  pform.reset();
  const f = pform.elements;
  f.title.value = p?.title || '';
  f.category.value = p?.category || 'prezentare';
  f.client.value = p?.client || '';
  f.year.value = p?.year || '';
  f.summary.value = p?.summary || '';
  f.description.value = p?.description || '';
  f.tags.value = (p?.tags || []).join(', ');
  f.url.value = p?.url || '';
  f.imageAlt.value = p?.imageAlt || '';
  f.published.checked = p ? p.published : true;
  f.demo.checked = Boolean(p?.demo);
  f.order.value = p?.order ?? 0;
  setPreview(p?.image, p?.imageAlt);
  $('#pf-error').textContent = '';
  editor.showModal();
  f.title.focus();
}

$('#new-project').addEventListener('click', () => editProject(null));
$('#pf-cancel').addEventListener('click', () => editor.close());
$('#pf-remove-image').addEventListener('click', () => setPreview(''));

$('#pf-file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  $('#pf-error').textContent = '';
  if (file.size > 2.5 * 1024 * 1024) {
    $('#pf-error').textContent = 'Imaginea depășește 2,5 MB.';
    return;
  }
  const dataUrl = await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
  try {
    const { url } = await api('uploads', { method: 'POST', body: { dataUrl } });
    setPreview(url, pform.elements.imageAlt.value);
    pform.elements.imageAlt.focus();
  } catch (err) {
    $('#pf-error').textContent = err.message;
  }
});

pform.addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = pform.elements;
  const body = {
    title: f.title.value,
    category: f.category.value,
    client: f.client.value,
    year: f.year.value,
    summary: f.summary.value,
    description: f.description.value,
    tags: f.tags.value,
    url: f.url.value,
    image: f.image.value,
    imageAlt: f.imageAlt.value,
    published: f.published.checked,
    demo: f.demo.checked,
    order: f.order.value,
  };
  try {
    await api(editingId ? `projects/${editingId}` : 'projects', { method: editingId ? 'PUT' : 'POST', body });
    editor.close();
    loadProjects();
  } catch (err) {
    $('#pf-error').textContent = [err.message, ...Object.values(err.fields || {})].join(' ');
  }
});

// ---------- Recenzii ----------
let reviewStatus = 'pending';
$('#review-filter').addEventListener('click', (e) => {
  const b = e.target.closest('[data-status]');
  if (!b) return;
  reviewStatus = b.dataset.status;
  $$('#review-filter [data-status]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  loadReviews();
});

async function loadReviews() {
  const items = (await api('reviews')).items.filter((r) => r.status === reviewStatus).reverse();
  const list = $('#reviews-list');
  if (!items.length) return list.replaceChildren(h('p', { class: 'empty' }, 'Nicio recenzie în această categorie.'));
  const patch = async (r, body) => {
    await api(`reviews/${r.id}`, { method: 'PATCH', body });
    loadReviews();
    loadOverview();
  };
  list.replaceChildren(
    ...items.map((r) => {
      const reply = h('textarea', { 'aria-label': `Răspuns public la recenzia lui ${r.name}`, maxlength: 600 });
      reply.value = r.reply || '';
      return h(
        'article',
        { class: 'item' },
        h('div', { class: 'item-head' }, h('h3', {}, `${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)} · ${r.name}`), r.verified ? h('span', { class: 'pill ok' }, 'Client verificat') : null),
        h('p', { class: 'meta' }, [r.role, r.company].filter(Boolean).join(', ') || '—', ' · ', r.email, ' · primită ', fmt(r.createdAt)),
        h('p', {}, r.text),
        h('div', { class: 'reply-box' }, h('label', {}, 'Răspuns public (opțional)'), reply),
        h(
          'div',
          { class: 'actions' },
          r.status !== 'approved' ? h('button', { class: 'btn btn-sm btn-ok', type: 'button', onclick: () => patch(r, { status: 'approved', reply: reply.value }) }, 'Aprobă și publică') : null,
          r.status !== 'rejected' ? h('button', { class: 'btn btn-sm btn-ghost', type: 'button', onclick: () => patch(r, { status: 'rejected' }) }, 'Respinge') : null,
          h('button', { class: 'btn btn-sm btn-ghost', type: 'button', onclick: () => patch(r, { reply: reply.value }) }, 'Salvează răspunsul'),
          h('button', { class: 'btn btn-sm btn-ghost', type: 'button', onclick: () => patch(r, { verified: !r.verified }) }, r.verified ? 'Elimină „verificat”' : 'Marchează client verificat'),
          h('button', {
            class: 'btn btn-sm btn-danger', type: 'button',
            onclick: async () => {
              if (!confirmAction('Ștergi definitiv recenzia?')) return;
              await api(`reviews/${r.id}`, { method: 'DELETE' });
              loadReviews();
            },
          }, 'Șterge')
        )
      );
    })
  );
}

// ---------- Mesaje ----------
const STATUS = { new: 'Nou', read: 'Citit', answered: 'Răspuns trimis' };

async function loadMessages() {
  const items = (await api('messages')).items;
  const list = $('#messages-list');
  if (!items.length) return list.replaceChildren(h('p', { class: 'empty' }, 'Niciun mesaj.'));
  list.replaceChildren(
    ...items.map((m) =>
      h(
        'article',
        { class: 'item' },
        h('div', { class: 'item-head' }, h('h3', {}, `${m.firstName} ${m.lastName}${m.company ? ` · ${m.company}` : ''}`), h('span', { class: `pill ${m.status === 'new' ? 'warn' : 'ok'}` }, STATUS[m.status])),
        h('p', { class: 'meta' }, fmt(m.createdAt), ' · ', h('a', { href: `mailto:${m.email}` }, m.email), m.phone ? [' · ', h('a', { href: `tel:${m.phone}` }, m.phone)] : null, m.website ? [' · ', h('a', { href: m.website, target: '_blank', rel: 'noopener noreferrer' }, m.website)] : null),
        h('p', {}, m.message || '(fără descriere)'),
        h(
          'div',
          { class: 'actions' },
          ...Object.entries(STATUS)
            .filter(([k]) => k !== m.status)
            .map(([k, l]) => h('button', { class: 'btn btn-sm btn-ghost', type: 'button', onclick: async () => { await api(`messages/${m.id}`, { method: 'PATCH', body: { status: k } }); loadMessages(); loadOverview(); } }, `Marchează: ${l}`)),
          h('button', {
            class: 'btn btn-sm btn-danger', type: 'button',
            onclick: async () => {
              if (!confirmAction('Ștergi definitiv mesajul?')) return;
              await api(`messages/${m.id}`, { method: 'DELETE' });
              loadMessages();
            },
          }, 'Șterge')
        )
      )
    )
  );
}

// ---------- Newsletter ----------
async function loadSubscribers() {
  const items = (await api('subscribers')).items;
  const list = $('#subscribers-list');
  if (!items.length) return list.replaceChildren(h('p', { class: 'empty' }, 'Niciun abonat.'));
  list.replaceChildren(
    ...items.map((s) =>
      h(
        'div',
        { class: 'item item-head' },
        h('span', {}, s.email, ' ', h('span', { class: `pill ${s.status === 'confirmed' ? 'ok' : 'warn'}` }, s.status === 'confirmed' ? 'Confirmat' : 'Neconfirmat')),
        h('span', { class: 'meta' }, `abonat ${fmt(s.createdAt)}`),
        h('button', { class: 'btn btn-sm btn-ghost', type: 'button', onclick: async () => { if (!confirmAction(`Elimini ${s.email} din listă?`)) return; await api(`subscribers/${s.id}`, { method: 'DELETE' }); loadSubscribers(); } }, 'Elimină')
      )
    )
  );
}

$('#campaign-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = $('#campaign-msg');
  const f = e.target.elements;
  if (!confirmAction('Trimiți emailul tuturor abonaților confirmați?')) return;
  try {
    const r = await api('newsletter/send', { method: 'POST', body: { subject: f.subject.value, body: f.body.value } });
    msg.textContent = `Trimis către ${r.sent} din ${r.total} abonați.`;
    e.target.reset();
  } catch (err) {
    msg.textContent = err.message;
  }
});

// ---------- GDPR ----------
async function loadGdpr() {
  const { items, log } = await api('deletion-requests');
  $('#deletion-list').replaceChildren(
    ...(items.length
      ? items.map((r) =>
          h(
            'div',
            { class: 'item' },
            h('div', { class: 'item-head' }, h('strong', {}, r.email), h('span', { class: 'meta' }, fmt(r.createdAt))),
            r.details ? h('p', {}, r.details) : null,
            h('p', { class: 'meta' }, 'Utilizatorul nu a confirmat încă linkul din email. Dacă identitatea e confirmată pe altă cale, poți șterge manual.'),
            h('div', { class: 'actions' }, h('button', { class: 'btn btn-sm btn-danger', type: 'button', onclick: () => erase(r.email) }, 'Șterge acum'))
          )
        )
      : [h('p', { class: 'empty' }, 'Nicio cerere în așteptare.')])
  );
  $('#deletion-log').replaceChildren(
    ...(log.length
      ? log.map((l) => h('div', { class: 'item item-head' }, h('code', {}, `${l.emailHash.slice(0, 16)}…`), h('span', { class: 'meta' }, `${fmt(l.at)} · de ${l.by} · ${l.counts.messages} mesaje, ${l.counts.reviews} recenzii, ${l.counts.subscribers} abonări`)))
      : [h('p', { class: 'empty' }, 'Jurnalul este gol.')])
  );
}

async function erase(email) {
  if (!confirmAction(`Ștergi definitiv toate datele asociate adresei ${email}? Acțiunea nu poate fi anulată.`)) return;
  const r = await api('erase', { method: 'POST', body: { email } });
  $('#erase-msg').textContent = `Șterse: ${r.counts.messages} mesaje, ${r.counts.reviews} recenzii, ${r.counts.subscribers} abonări.`;
  loadGdpr();
  loadOverview();
}

$('#erase-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const email = $('#erase-email').value.trim();
  if (email) erase(email).catch((err) => ($('#erase-msg').textContent = err.message));
});

$('#export-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = $('#export-email').value.trim();
  if (!email) return;
  const data = await api(`export?email=${encodeURIComponent(email)}`);
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = h('a', { href: URL.createObjectURL(blob), download: `date-${email.replace(/[^a-z0-9]/gi, '_')}.json` });
  a.click();
  URL.revokeObjectURL(a.href);
});

// ---------- Start ----------
const { authenticated } = await api('session');
if (authenticated) showApp();
else showLogin();
