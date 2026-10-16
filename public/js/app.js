// Punctul de intrare al site-ului public.
import { initConsent } from './consent.js';
import { initForms } from './forms.js';
import { initDialogs, openDialog, prefersReducedMotion, jiggle } from './ui.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;

// ---------- Header + meniul pe tot ecranul ----------
function initNav() {
  const header = $('[data-header]');
  const onScroll = () => header.classList.toggle('is-scrolled', scrollY > 24);
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  const menu = $('#site-menu');
  const toggle = $('[aria-controls="site-menu"]');
  if (!menu || !toggle) return;
  const sync = () => toggle.setAttribute('aria-expanded', String(menu.open));
  new MutationObserver(sync).observe(menu, { attributes: true, attributeFilter: ['open'] });
  // Pagina din spatele unui dialog modal nu poate fi derulată, așa că închidem meniul
  // și abia apoi mergem la secțiune (cu focus pe ea, pentru cititoarele de ecran).
  menu.addEventListener('click', (e) => {
    const link = e.target.closest('[data-menu-link]');
    if (!link) return;
    const target = document.getElementById(new URL(link.href).hash.slice(1));
    menu.close();
    if (!target || new URL(link.href).pathname !== location.pathname) return;
    e.preventDefault();
    history.pushState(null, '', link.hash);
    target.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
  });
}

// ---------- Slidere (proiecte, domenii): derulare nativă + butoane ----------
function initCarousels() {
  for (const root of $$('[data-carousel]')) {
    const track = $('[data-carousel-track]', root);
    const prev = $('[data-carousel-prev]', root);
    const next = $('[data-carousel-next]', root);
    if (!track || !prev || !next) continue;
    const step = () => {
      const item = track.firstElementChild;
      const gap = parseFloat(getComputedStyle(track).columnGap) || 0;
      return item ? item.getBoundingClientRect().width + gap : track.clientWidth;
    };
    const update = () => {
      const max = track.scrollWidth - track.clientWidth - 2;
      prev.disabled = track.scrollLeft <= 2;
      next.disabled = track.scrollLeft >= max;
    };
    prev.addEventListener('click', () => track.scrollBy({ left: -step(), behavior: prefersReducedMotion() ? 'auto' : 'smooth' }));
    next.addEventListener('click', () => track.scrollBy({ left: step(), behavior: prefersReducedMotion() ? 'auto' : 'smooth' }));
    track.addEventListener('scroll', update, { passive: true });
    addEventListener('resize', update);
    update();
    if (track.children.length < 2) root.querySelector('.carousel-buttons')?.setAttribute('hidden', '');
  }
}

// ---------- Apariție elastică la derulare ----------
function initReveal() {
  const items = $$('.reveal');
  if (!('IntersectionObserver' in window) || prefersReducedMotion()) {
    items.forEach((el) => el.classList.add('is-in'));
    return;
  }
  // Elementele vecine apar în cascadă.
  items.forEach((el) => {
    const siblings = [...el.parentElement.children].filter((c) => c.classList.contains('reveal'));
    el.style.setProperty('--d', `${Math.min(siblings.indexOf(el), 5) * 80}ms`);
  });
  let observerFired = false;
  const io = new IntersectionObserver(
    (entries) => {
      observerFired = true;
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('is-in');
        io.unobserve(entry.target);
      }
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.08 }
  );
  items.forEach((el) => io.observe(el));
  // Siguranță: conținutul nu trebuie să rămână niciodată invizibil (ex. browsere care întârzie observerul).
  setTimeout(() => {
    if (!observerFired) items.forEach((el) => el.classList.add('is-in'));
  }, 2000);
}

// ---------- Înclinare 3D cu revenire elastică ----------
function initTilt() {
  if (!finePointer) return;
  for (const el of $$('.tilt')) {
    el.addEventListener('pointermove', (e) => {
      if (prefersReducedMotion()) return;
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      el.classList.add('is-tilting');
      el.style.setProperty('--rx', `${(-y * 8).toFixed(2)}deg`);
      el.style.setProperty('--ry', `${(x * 10).toFixed(2)}deg`);
    });
    el.addEventListener('pointerleave', () => {
      el.classList.remove('is-tilting');
      el.style.setProperty('--rx', '0deg');
      el.style.setProperty('--ry', '0deg');
    });
  }
}

// ---------- Butoane „magnetice” ----------
function initMagnetic() {
  if (!finePointer) return;
  for (const el of $$('.magnetic')) {
    el.addEventListener('pointermove', (e) => {
      if (prefersReducedMotion()) return;
      const r = el.getBoundingClientRect();
      el.style.setProperty('--mx', `${((e.clientX - r.left - r.width / 2) * 0.18).toFixed(1)}px`);
      el.style.setProperty('--my', `${((e.clientY - r.top - r.height / 2) * 0.3).toFixed(1)}px`);
    });
    el.addEventListener('pointerleave', () => {
      el.style.setProperty('--mx', '0px');
      el.style.setProperty('--my', '0px');
    });
  }
}

// Efect elastic și la atingere (pe telefoane nu există hover).
function initTapJelly() {
  document.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') return;
    const el = e.target.closest('.btn, .chip, .logo-img');
    if (el) jiggle(el);
  });
}

// ---------- Proiecte: filtre + detalii ----------
function initProjects() {
  const filters = $('[data-filters]');
  const status = $('[data-filter-status]');
  const cards = $$('.project-card');
  filters?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-filter]');
    if (!btn) return;
    const f = btn.dataset.filter;
    $$('[data-filter]', filters).forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
    let visible = 0;
    cards.forEach((card) => {
      const show = f === 'all' || card.dataset.category === f;
      card.hidden = !show;
      if (show) {
        visible += 1;
        card.classList.remove('is-in');
        requestAnimationFrame(() => requestAnimationFrame(() => card.classList.add('is-in')));
      }
    });
    if (status) status.textContent = visible ? `${visible} proiecte afișate.` : 'Nu există proiecte în această categorie momentan.';
  });

  const dataEl = $('#projects-data');
  const dialog = $('#project-dialog');
  if (!dataEl || !dialog) return;
  const projects = JSON.parse(dataEl.textContent || '[]');

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-project]');
    if (!btn) return;
    const p = projects.find((x) => x.id === btn.dataset.project);
    if (!p) return;

    const media = $('[data-pd-media]', dialog);
    media.replaceChildren();
    if (p.image) {
      const img = new Image();
      img.src = p.image;
      img.alt = p.imageAlt || '';
      media.append(img);
    }
    $('[data-pd-meta]', dialog).textContent = [p.category, p.year, p.client, p.demo ? 'Proiect demonstrativ' : ''].filter(Boolean).join(' · ');
    $('[data-pd-title]', dialog).textContent = p.title;
    $('[data-pd-description]', dialog).textContent = p.description || p.summary;
    const tags = $('[data-pd-tags]', dialog);
    tags.replaceChildren(...(p.tags || []).map((t) => Object.assign(document.createElement('li'), { textContent: t })));
    const link = $('[data-pd-link]', dialog);
    link.replaceChildren();
    if (p.url) {
      const a = Object.assign(document.createElement('a'), { href: p.url, target: '_blank', rel: 'noopener', className: 'btn btn-primary jelly-hover' });
      a.textContent = 'Vezi site-ul live';
      const sr = Object.assign(document.createElement('span'), { className: 'visually-hidden', textContent: ' (se deschide într-o filă nouă)' });
      a.append(sr);
      link.append(a);
    }
    openDialog(dialog, btn);
  });
}

// ---------- Videoclipul din hero ----------
// Se încarcă doar dacă vizitatorul nu a cerut mișcare redusă sau economie de date;
// altfel rămâne imaginea statică. Butonul de pauză respectă WCAG 2.2.2 (conținut în mișcare).
function initHeroVideo() {
  const frame = $('[data-hero-video]');
  const toggle = $('[data-video-toggle]');
  if (!frame || !toggle) return;
  const videos = [...frame.querySelectorAll('video')];
  if (!videos.length) return;
  const label = $('[data-video-toggle-label]', toggle);
  const saveData = navigator.connection?.saveData;
  const wide = matchMedia('(min-width: 768px)').matches;
  const FADE = 1.2; // secunde de tranziție între clipuri
  let current = 0;
  let started = false;
  let userPaused = false;

  const active = () => videos[current];
  const load = (video) => {
    if (!video.src) video.src = wide ? video.dataset.srcWide : video.dataset.srcNarrow;
  };
  const setPaused = (paused) => {
    toggle.setAttribute('aria-pressed', String(paused));
    label.textContent = paused ? 'Pornește videoclipul' : 'Oprește videoclipul';
  };
  const play = () => active().play().then(() => setPaused(false)).catch(() => setPaused(true));

  // Trece la clipul următor cu o tranziție încrucișată; ultimul clip revine la primul (buclă).
  const next = () => {
    const prev = active();
    current = (current + 1) % videos.length;
    const video = active();
    if (video === prev) {
      video.currentTime = 0;
      return;
    }
    load(video);
    video.currentTime = 0;
    video.play().catch(() => {});
    video.classList.add('is-active');
    prev.classList.remove('is-active');
    setTimeout(() => { if (prev !== active()) prev.pause(); }, FADE * 1000);
  };

  videos.forEach((video, i) => {
    video.addEventListener('timeupdate', () => {
      if (i === current && video.duration && video.duration - video.currentTime <= FADE) next();
    });
    video.addEventListener('ended', () => { if (i === current) next(); });
  });

  const start = () => {
    if (started) return play();
    started = true;
    load(active());
    active().addEventListener('playing', () => {
      frame.classList.add('is-ready');
      // Pregătește din timp clipul următor, ca tranziția să fie fluidă.
      videos.forEach((video) => { load(video); video.preload = 'auto'; });
    }, { once: true });
    toggle.hidden = false;
    play();
  };

  toggle.addEventListener('click', () => {
    if (active().paused) {
      userPaused = false;
      start();
    } else {
      userPaused = true;
      videos.forEach((video) => video.pause());
      setPaused(true);
    }
  });

  // Oprește redarea când hero-ul nu e vizibil (economie de CPU și baterie).
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([entry]) => {
      if (!started || userPaused) return;
      if (entry.isIntersecting) play();
      else videos.forEach((video) => video.pause());
    }).observe(frame);
  }

  // Butonul „Reduce animațiile” din subsol oprește și videoclipul.
  $('[data-motion-toggle]')?.addEventListener('click', () => {
    if (prefersReducedMotion()) {
      videos.forEach((video) => video.pause());
      setPaused(true);
    }
  });

  if (!prefersReducedMotion() && !saveData) start();
  else {
    // Fără redare automată: afișăm doar cadrul static, iar videoclipul pornește la cerere.
    frame.classList.add('is-ready');
    toggle.hidden = false;
    setPaused(true);
    return;
  }
  setPaused(false);
}

// ---------- Preferința „Reduce animațiile” ----------
function initMotionToggle() {
  const btn = $('[data-motion-toggle]');
  if (!btn) return;
  const root = document.documentElement;
  const sync = () => {
    const on = root.classList.contains('reduce-motion');
    btn.setAttribute('aria-pressed', String(on));
    btn.textContent = on ? 'Activează animațiile' : 'Reduce animațiile';
  };
  btn.addEventListener('click', () => {
    root.classList.toggle('reduce-motion');
    try {
      if (root.classList.contains('reduce-motion')) localStorage.setItem('lprd_motion', 'reduce');
      else localStorage.removeItem('lprd_motion');
    } catch {
      /* preferința rămâne doar pentru pagina curentă */
    }
    sync();
  });
  sync();
}

initNav();
initCarousels();
initConsent();
initDialogs();
initForms();
initReveal();
initTilt();
initMagnetic();
initTapJelly();
initProjects();
initMotionToggle();
initHeroVideo();
