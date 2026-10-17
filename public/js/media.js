// Videoclipul decorativ se încarcă numai când CTA ajunge în ecran.
import { prefersReducedMotion } from './ui.js';

export function initCtaVideo() {
  const figure = document.querySelector('.cta-window');
  const video = figure?.querySelector('video');
  if (!figure || !video) return;
  let inView = false;
  let loaded = false;

  function load(reduced) {
    video.preload = reduced ? 'metadata' : 'none';
    if (loaded || !video.dataset.src) return;
    video.src = video.dataset.src;
    video.load();
    loaded = true;
  }

  function update() {
    const reduced = prefersReducedMotion();
    if (!inView || document.visibilityState !== 'visible') {
      video.pause();
      return;
    }
    if (reduced) {
      load(true);
      video.pause();
      if (video.readyState > 0) video.currentTime = 0;
      return;
    }
    load(false);
    video.play().catch(() => {});
  }

  function checkViewport() {
    const rect = figure.getBoundingClientRect();
    inView = rect.top < innerHeight && rect.bottom > 0;
    update();
  }

  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      inView = entries.some((entry) => entry.isIntersecting);
      update();
    }, { threshold: 0.12 });
    observer.observe(figure);
  } else {
    addEventListener('scroll', checkViewport, { passive: true });
    addEventListener('resize', checkViewport, { passive: true });
    checkViewport();
  }

  document.addEventListener('visibilitychange', update);
  new MutationObserver(update).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', update);
}
