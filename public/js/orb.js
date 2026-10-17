// Globul de progres rămâne static la mișcare redusă; punctele se calculează o singură dată.
import { prefersReducedMotion } from './ui.js';

const COUNT = 160;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const points = Array.from({ length: COUNT }, (_, i) => {
  const y = 1 - (i / (COUNT - 1)) * 2;
  const radius = Math.sqrt(1 - y * y);
  const angle = i * GOLDEN_ANGLE;
  return { x: Math.cos(angle) * radius, y, z: Math.sin(angle) * radius };
});
const edges = [];
const edgeKeys = new Set();

for (let i = 0; i < points.length; i += 1) {
  let nearA = -1;
  let nearB = -1;
  let distA = Infinity;
  let distB = Infinity;
  for (let j = 0; j < points.length; j += 1) {
    if (i === j) continue;
    const dx = points[i].x - points[j].x;
    const dy = points[i].y - points[j].y;
    const dz = points[i].z - points[j].z;
    const distance = dx * dx + dy * dy + dz * dz;
    if (distance < distA) {
      nearB = nearA;
      distB = distA;
      nearA = j;
      distA = distance;
    } else if (distance < distB) {
      nearB = j;
      distB = distance;
    }
  }
  for (const j of [nearA, nearB]) {
    const key = i < j ? i + ':' + j : j + ':' + i;
    if (!edgeKeys.has(key)) {
      edgeKeys.add(key);
      edges.push([i, j]);
    }
  }
}

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function initScrollOrb() {
  const button = document.querySelector('[data-scroll-orb]');
  if (!button) return;
  const canvas = button.querySelector('canvas');
  const context = canvas?.getContext('2d');
  const logo = document.querySelector('.site-header .logo');
  let size = 0;
  let pixelRatio = 0;
  let progress = 0;
  let angle = 0;
  let hoverEase = 0;
  let lastTime = 0;
  let frame = 0;
  let updateFrame = 0;

  const canRender = () => !button.hidden && document.visibilityState === 'visible';
  function resizeCanvas() {
    const rect = button.getBoundingClientRect();
    if (!canvas || !context || !rect.width) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    if (size === rect.width && pixelRatio === ratio) return;
    size = rect.width;
    pixelRatio = ratio;
    canvas.width = Math.round(size * ratio);
    canvas.height = Math.round(size * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
  }
  function draw(rotation, tilt, hover) {
    if (!context || !size) return;
    context.clearRect(0, 0, size, size);
    const sinY = Math.sin(rotation);
    const cosY = Math.cos(rotation);
    const sinX = Math.sin(tilt);
    const cosX = Math.cos(tilt);
    const radius = size * 0.32;
    const projected = points.map((point) => {
      const x = point.x * cosY - point.z * sinY;
      const z = point.x * sinY + point.z * cosY;
      const y = point.y * cosX - z * sinX;
      const depthZ = point.y * sinX + z * cosX;
      const scale = 2.45 / (3.3 - depthZ);
      return {
        x: size / 2 + x * radius * scale,
        y: size / 2 + y * radius * scale,
        depth: (depthZ + 1) / 2,
      };
    });

    context.lineWidth = 0.7;
    for (const [a, b] of edges) {
      const depth = (projected[a].depth + projected[b].depth) / 2;
      context.strokeStyle = 'rgba(59,130,246,' + (0.08 + depth * 0.2).toFixed(3) + ')';
      context.beginPath();
      context.moveTo(projected[a].x, projected[a].y);
      context.lineTo(projected[b].x, projected[b].y);
      context.stroke();
    }

    for (const point of projected) {
      const depth = clamp(point.depth, 0, 1);
      const red = Math.round(37 + (169 - 37) * depth + hover * 12);
      const green = Math.round(99 + (204 - 99) * depth + hover * 12);
      const blue = Math.round(235 + (255 - 235) * depth + hover * 8);
      context.fillStyle = 'rgb(' + red + ',' + green + ',' + blue + ')';
      context.beginPath();
      context.arc(point.x, point.y, 0.6 + depth * 0.8, 0, Math.PI * 2);
      context.fill();
    }
  }
  function stopLoop() {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    lastTime = 0;
  }
  function render(now) {
    frame = 0;
    if (!canRender()) return;
    if (prefersReducedMotion()) {
      hoverEase = 0;
      angle = 0;
      draw(0, progress * 0.6, 0);
      return;
    }
    const delta = lastTime ? Math.min((now - lastTime) / 1000, 0.12) : 0;
    lastTime = now;
    const active = button.matches(':hover, :focus');
    hoverEase += ((active ? 1 : 0) - hoverEase) * (1 - Math.exp(-delta * 5));
    angle += delta * 0.35 * (1 + hoverEase * 1.5);
    draw(angle, progress * 0.6, hoverEase);
    frame = requestAnimationFrame(render);
  }
  function startLoop() {
    if (!canRender()) return;
    resizeCanvas();
    if (prefersReducedMotion()) {
      stopLoop();
      draw(0, progress * 0.6, 0);
    } else if (!frame) {
      frame = requestAnimationFrame(render);
    }
  }
  function sync() {
    updateFrame = 0;
    const maxScroll = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight) - innerHeight;
    progress = maxScroll > 0 ? clamp((scrollY / maxScroll) * 100, 0, 100) : 0;
    button.style.setProperty('--p', progress.toFixed(2));
    button.hidden = scrollY <= innerHeight * 0.8 || document.body.classList.contains('has-cookie-banner');
    if (canRender()) startLoop();
    else stopLoop();
  }
  function queueSync() {
    if (!updateFrame) updateFrame = requestAnimationFrame(sync);
  }

  button.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    logo?.focus({ preventScroll: true });
  });
  addEventListener('scroll', queueSync, { passive: true });
  addEventListener('resize', queueSync, { passive: true });
  document.addEventListener('visibilitychange', queueSync);
  new MutationObserver(queueSync).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  new MutationObserver(queueSync).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', queueSync);
  if ('ResizeObserver' in window) new ResizeObserver(() => {
    resizeCanvas();
    if (canRender() && prefersReducedMotion()) draw(0, progress * 0.6, 0);
  }).observe(button);
  queueSync();
}
