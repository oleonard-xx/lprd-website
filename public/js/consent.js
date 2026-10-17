// Banner de consimțământ: nimic opțional nu rulează înainte de acord,
// iar „Refuz” și „Accept” au aceeași vizibilitate și același număr de clicuri.

const KEY = 'seecode_consent';
const VERSION = 1;
const MAX_AGE = 182 * 24 * 60 * 60 * 1000; // re-întrebăm după ~6 luni

let banner;
let opener = null;
let pageviewSent = false;

export function getConsent() {
  try {
    const c = JSON.parse(localStorage.getItem(KEY));
    if (!c || c.v !== VERSION || Date.now() - c.at > MAX_AGE) return null;
    return c;
  } catch {
    return null;
  }
}

function apply(consent) {
  if (consent?.statistics && !pageviewSent) {
    pageviewSent = true;
    fetch('/api/stats/pageview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: location.pathname }),
      keepalive: true,
    }).catch(() => {});
  }
}

function save(statistics) {
  const consent = { v: VERSION, at: Date.now(), statistics };
  try {
    localStorage.setItem(KEY, JSON.stringify(consent));
  } catch {
    /* fără stocare, alegerea e valabilă doar pentru pagina curentă */
  }
  apply(consent);
  hide();
}

function setPrefsOpen(open) {
  const prefs = banner.querySelector('[data-consent-prefs]');
  prefs.hidden = !open;
  banner.querySelector('[data-consent-action="customize"]').setAttribute('aria-expanded', String(open));
  banner.querySelector('[data-consent-action="customize"]').hidden = open;
  banner.querySelector('[data-consent-action="save"]').hidden = !open;
}

function show({ withPrefs = false } = {}) {
  const current = getConsent();
  banner.querySelector('[data-consent-cat="statistics"]').checked = Boolean(current?.statistics);
  setPrefsOpen(withPrefs);
  banner.hidden = false;
  document.body.classList.add('has-cookie-banner');
}

function hide() {
  banner.hidden = true;
  document.body.classList.remove('has-cookie-banner');
  if (opener) {
    opener.focus();
    opener = null;
  }
}

export function initConsent() {
  banner = document.querySelector('[data-consent]');
  if (!banner) return;

  banner.addEventListener('click', (e) => {
    const action = e.target.closest('[data-consent-action]')?.dataset.consentAction;
    if (action === 'accept') save(true);
    else if (action === 'reject') save(false);
    else if (action === 'save') save(banner.querySelector('[data-consent-cat="statistics"]').checked);
    else if (action === 'customize') {
      setPrefsOpen(true);
      banner.querySelector('[data-consent-cat="statistics"]').focus();
    }
  });

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-open-consent]');
    if (!btn) return;
    opener = btn;
    show({ withPrefs: true });
    banner.querySelector('[data-consent-cat="statistics"]').focus();
  });

  banner.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && opener) hide();
  });

  const consent = getConsent();
  if (consent) apply(consent);
  else show();
}
