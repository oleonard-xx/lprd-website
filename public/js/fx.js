// Interacțiuni de text și carduri: titluri pe cuvinte, „decodare” de etichete, reflector pe carduri, progres la derulare.
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// 1. Titluri pe cuvinte (h2.display-sm), reveal în cascadă la intrarea în ecran.
function splitWords(el) {
  if (el.dataset.fx) return;
  el.dataset.fx = '1';
  const walk = (node) => {
    [...node.childNodes].forEach((n) => {
      if (n.nodeType === 3) {
        const frag = document.createDocumentFragment();
        n.textContent.split(/(\s+)/).forEach((part) => {
          if (!part) return;
          if (/^\s+$/.test(part)) return frag.append(' ');
          const w = document.createElement('span');
          w.className = 'w';
          const inner = document.createElement('span');
          inner.textContent = part;
          w.append(inner);
          frag.append(w);
        });
        n.replaceWith(frag);
      } else if (n.nodeType === 1) walk(n);
    });
  };
  walk(el);
  $$('.w > span', el).forEach((s, i) => s.style.setProperty('--i', i));
  el.classList.add('fx-words');
}
const headings = $$('h2.display-sm, .cta-inner .display');
if (!reduce && 'IntersectionObserver' in window) {
  headings.forEach(splitWords);
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); } });
  }, { threshold: 0.35 });
  headings.forEach((h) => io.observe(h));
}

// 2. Etichete mono: „decodare” la hover (litere amestecate care se aliniază).
const GLYPHS = '01{}<>/_=+*#';
function scramble(el) {
  if (el.dataset.busy) return;
  const final = el.dataset.text || (el.dataset.text = el.textContent);
  el.dataset.busy = '1';
  let frame = 0;
  const total = final.length * 2;
  const tick = () => {
    el.textContent = [...final].map((c, i) => (c === ' ' || i < frame / 2 ? c : GLYPHS[(Math.random() * GLYPHS.length) | 0])).join('');
    if (++frame <= total) requestAnimationFrame(tick);
    else { el.textContent = final; delete el.dataset.busy; }
  };
  tick();
}
if (!reduce) {
  $$('.eyebrow, .slide-cat, .hero-col-label, .project-group-title').forEach((el) => {
    // păstrăm structura (span-uri) doar pentru elementele cu text simplu
    if (el.children.length || el.closest('.hero')) return;
    el.classList.add('fx-scramble');
    el.addEventListener('pointerenter', () => scramble(el));
  });
}

// 3. Reflector pe carduri: poziția cursorului ca variabile CSS.
document.addEventListener('pointermove', (e) => {
  const card = e.target.closest?.('.project-card .project, .feature-card, .package, .industry-card, .process-tile, .review');
  if (!card) return;
  const r = card.getBoundingClientRect();
  card.style.setProperty('--mx', `${e.clientX - r.left}px`);
  card.style.setProperty('--my', `${e.clientY - r.top}px`);
}, { passive: true });

// 4. Progres la derulare.
if (!reduce) {
  const bar = Object.assign(document.createElement('div'), { className: 'fx-progress', ariaHidden: 'true' });
  document.body.append(bar);
  let ticking = false;
  const update = () => {
    const max = document.documentElement.scrollHeight - innerHeight;
    bar.style.setProperty('--p', max > 0 ? Math.min(1, scrollY / max).toFixed(4) : 0);
    ticking = false;
  };
  addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
  update();
}
