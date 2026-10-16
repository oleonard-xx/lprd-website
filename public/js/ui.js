// Utilitare de interfață: notificări, animații „jiggly”, dialoguri.

export const prefersReducedMotion = () =>
  document.documentElement.classList.contains('reduce-motion') || matchMedia('(prefers-reduced-motion: reduce)').matches;

export function toast(message) {
  const region = document.querySelector('.toast-region');
  if (!region) return;
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = message;
  region.append(el);
  setTimeout(() => el.remove(), 4200);
}

// Animație elastică la cerere (de ex. după trimiterea unui formular).
export function jiggle(el) {
  if (!el || prefersReducedMotion()) return;
  el.classList.remove('is-jelly');
  void el.offsetWidth;
  el.classList.add('is-jelly');
  el.addEventListener('animationend', () => el.classList.remove('is-jelly'), { once: true });
}

// Dialoguri native (<dialog>): focus capturat, Esc închide, focusul revine la buton.
export function openDialog(dialog, opener) {
  dialog._opener = opener || document.activeElement;
  dialog.showModal();
}

export function initDialogs() {
  document.addEventListener('click', (e) => {
    const trigger = e.target.closest('[data-open-dialog]');
    if (trigger) {
      const dialog = document.getElementById(trigger.dataset.openDialog);
      if (dialog) openDialog(dialog, trigger);
    }
    if (e.target.closest('[data-close]')) e.target.closest('dialog')?.close();
  });
  document.querySelectorAll('dialog').forEach((dialog) => {
    // Clic pe fundalul întunecat închide dialogul.
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) dialog.close();
    });
    dialog.addEventListener('close', () => {
      dialog._opener?.focus();
      dialog._opener = null;
    });
  });
}
